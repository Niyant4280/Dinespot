from flask import Flask, jsonify, request
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import os

app = Flask(__name__)
front_end_url = "http://127.0.0.1:5500"  # Update if running on a different port/host
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize Firebase Admin SDK
cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)
db = firestore.client()  # ← critical: get Firestore client


@app.route('/')
def home():
    return "DineSpot Analytics API is running! 🚀<br>Open 'admin-dashboard.html' in your browser to view the dashboard."


@app.route('/api/restaurants', methods=['POST'])
def add_restaurant():
    try:
        data = request.json
        # Basic validation
        if not data.get('name'):
            return jsonify({'error': 'Name is required'}), 400
            
        # Add to 'restaurants' collection
        db.collection('restaurants').add({
            'name': data.get('name'),
            'category': data.get('category'),
            'image': data.get('image'),
            'layout': data.get('layout'),
            'createdAt': firestore.SERVER_TIMESTAMP
        })
        
        return jsonify({'message': 'Restaurant added successfully'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        # Get optional filter from query params
        restaurant_filter = request.args.get('restaurant')
        
        # 0. Check Cache First (only for "All Restaurants")
        if not restaurant_filter or restaurant_filter == "All Restaurants":
            cache_ref = db.collection('stats_cache').document('latest').get()
            if cache_ref.exists:
                stats = cache_ref.to_dict()
                # Ensure structure is consistent
                stats['available_restaurants'] = sorted(list(set(stats.get('restaurant_counts', {}).keys())))
                return jsonify(stats)

        # 1. Fallback to Live Stream (for filters or if cache missing)
        reservations_ref = db.collection('reservations')
        # ... rest of live stream logic ...
        docs = reservations_ref.stream()
        
        total_revenue = 0
        restaurant_counts = {}
        hourly_counts = {}
        monthly_revenue = {}
        table_counts = {}
        total_bookings = 0
        cancelled_bookings = 0
        
        # Collect restaurants from reservations
        active_restaurants = set()

        for doc in docs:
            data = doc.to_dict()
            restaurant_name = data.get('restaurant', 'Unknown')
            active_restaurants.add(restaurant_name)
            
            # Apply Filter
            if restaurant_filter and restaurant_filter != "All Restaurants" and restaurant_name != restaurant_filter:
                continue

            total_bookings += 1
            status = data.get('status', 'confirmed')
            if status == 'cancelled':
                cancelled_bookings += 1
            
            # Table popularity
            t_id = data.get('tableId', 'Unknown')
            table_counts[t_id] = table_counts.get(t_id, 0) + 1
            
            # Revenue & Stats (for non-cancelled mostly, but we count hits)
            if status != 'cancelled':
                cost_str = str(data.get('totalCost', '0')).replace('₹', '').replace(',', '')
                try:
                    cost = int(float(cost_str))
                except ValueError:
                    cost = 0
                total_revenue += cost
                
                # Monthly Revenue
                date_str = data.get('date', '')
                if date_str:
                    try:
                        # Handle both YYYY-MM-DD and other formats
                        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                        month_key = date_obj.strftime('%Y-%m')
                        monthly_revenue[month_key] = monthly_revenue.get(month_key, 0) + cost
                    except ValueError:
                        pass

                # Restaurant Popularity
                restaurant_counts[restaurant_name] = restaurant_counts.get(restaurant_name, 0) + 1

            # Peak Hours (all hits)
            time_str = data.get('time', '')
            if time_str:
                hour = time_str.split(':')[0]
                hourly_counts[hour] = hourly_counts.get(hour, 0) + 1

        # Calculate cancellation rate
        cancellation_rate = (cancelled_bookings / total_bookings * 100) if total_bookings > 0 else 0

        # Sort table popularity
        top_tables = sorted(table_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        # 2. Fetch "Official" Restaurants
        official_restaurants_ref = db.collection('restaurants')
        official_docs = official_restaurants_ref.stream()
        all_restaurants = list(active_restaurants)
        
        for doc in official_docs:
            name = doc.to_dict().get('name')
            if name and name not in all_restaurants:
                all_restaurants.append(name)
        
        return jsonify({
            'total_revenue': total_revenue,
            'restaurant_counts': restaurant_counts,
            'hourly_counts': hourly_counts,
            'monthly_revenue': monthly_revenue,
            'cancellation_rate': round(cancellation_rate, 2),
            'top_tables': top_tables,
            'total_bookings': total_bookings,
            'available_restaurants': sorted(all_restaurants)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/calculate-refund/<res_id>', methods=['GET'])
def calculate_refund(res_id):
    try:
        doc = db.collection('reservations').document(res_id).get()
        if not doc.exists:
            return jsonify({'error': 'Reservation not found'}), 404
        
        data = doc.to_dict()
        res_date = data.get('date') # YYYY-MM-DD
        res_time = data.get('time') # HH:mm
        
        if not res_date or not res_time:
            return jsonify({'refund_percent': 0, 'reason': 'Missing date/time info'})

        # Parse reservation time
        res_datetime = datetime.strptime(f"{res_date} {res_time}", "%Y-%m-%d %H:%M")
        now = datetime.now()
        
        # Calculate lead time in hours
        diff = res_datetime - now
        lead_hours = diff.total_seconds() / 3600
        
        refund_percent = 0
        if lead_hours > 24:
            refund_percent = 100
        elif lead_hours >= 2:
            refund_percent = 50
        else:
            refund_percent = 0
            
        # Get cost
        cost_str = str(data.get('totalCost', '0')).replace('₹', '').replace(',', '')
        try:
            total_cost = int(float(cost_str))
        except ValueError:
            total_cost = 0
            
        refund_amount = (total_cost * refund_percent) / 100
        
        return jsonify({
            'id': res_id,
            'total_cost': total_cost,
            'refund_percent': refund_percent,
            'refund_amount': refund_amount,
            'lead_hours': round(lead_hours, 2)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/reservations', methods=['GET'])
def get_reservations():
    try:
        restaurant_filter = request.args.get('restaurant')
        reservations_ref = db.collection('reservations')
        docs = reservations_ref.order_by('bookedAt', direction=firestore.Query.DESCENDING).limit(50).stream()
        
        reservations = []
        for doc in docs:
            data = doc.to_dict()
            res_name = data.get('restaurant', 'DineSpot')
            
            if restaurant_filter and restaurant_filter != "All Restaurants" and res_name != restaurant_filter:
                continue
                
            reservations.append({
                'id': doc.id,
                'restaurant': res_name,
                'date': data.get('date'),
                'time': data.get('time'),
                'guests': data.get('guests'),
                'status': data.get('status'),
                'bookedByEmail': data.get('bookedByEmail'),
                'largeGroup': data.get('largeGroup', False),
                'totalCost': data.get('totalCost', '₹0')
            })
            
        return jsonify({'reservations': reservations})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5001, debug=True)
