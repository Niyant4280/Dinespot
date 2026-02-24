// Stats API - Python analytics backend is not available in this serverless environment.
// Run the Python backend (dashboard_analytics.py on port 5001) separately for stats.
module.exports = (req, res) => {
    res.status(503).json({
        error: 'Stats service unavailable in serverless mode.',
        message: 'The analytics backend runs as a separate service. Please run dashboard_analytics.py locally on port 5001.'
    });
};
