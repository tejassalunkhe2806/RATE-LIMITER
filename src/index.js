const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const policyRoutes = require('./routes/policyRoutes');
const apiRoutes = require('./routes/apiRoutes');

dotenv.config();

const app = express();
app.use(express.json());

// Mount API routes (telemetry, keys, stream, test playground)
app.use('/api', apiRoutes);

// Mount administrative policy routes
app.use('/policies', policyRoutes);

// Serve static frontend assets from Vite build output
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Fallback for Single Page App client-side routing
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});





const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});