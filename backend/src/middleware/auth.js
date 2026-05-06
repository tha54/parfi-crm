const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const auth = req.headers.authorization;
  // Also accept token as query param for browser-opened HTML endpoints
  const queryToken = req.query.token;
  const raw = auth?.startsWith('Bearer ') ? auth.split(' ')[1] : queryToken;
  if (!raw) return res.status(401).json({ message: 'Token manquant' });
  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  next();
};

module.exports = { verifyToken, requireRole };
