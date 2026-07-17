const express = require('express');
const router = express.Router();
const { setPolicy, deletePolicy, getPolicy } = require('../policies');

// GET a specific policy (optional)
router.get('/:clientId', async (req, res) => {
  const { clientId } = req.params;
  try {
    const policy = await getPolicy(clientId);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.json(policy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /policies/:clientId – create/update
router.post('/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { algorithm, limit, window } = req.body;

  // basic validation
  if (!algorithm || !limit || !window) {
    return res.status(400).json({ error: 'Missing: algorithm, limit, window' });
  }
  if (!['token-bucket', 'sliding-window'].includes(algorithm)) {
    return res.status(400).json({ error: 'Algorithm must be token-bucket or sliding-window' });
  }
  if (limit < 1 || window < 1) {
    return res.status(400).json({ error: 'Limit and window must be positive numbers' });
  }

  try {
    await setPolicy(clientId, { algorithm, limit, window });
    res.status(201).json({ message: `Policy for ${clientId} created/updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /policies/:clientId
router.delete('/:clientId', async (req, res) => {
  const { clientId } = req.params;
  try {
    await deletePolicy(clientId);
    res.json({ message: `Policy for ${clientId} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;