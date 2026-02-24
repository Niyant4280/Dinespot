import sys
import os

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'dine-spot-backend'))

from dashboard_analytics import app

application = app
