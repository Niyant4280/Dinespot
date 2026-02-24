import sys
import os

# Add the backend directory to sys.path so we can import the app
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'dine-spot-backend'))

from dashboard_analytics import app

# Export for Vercel
# Vercel looks for 'app' or 'application' in the file
application = app
