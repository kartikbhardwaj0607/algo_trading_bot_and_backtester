const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         username:
 *           type: string
 *         email:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 */
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    hashedPassword: {
      type: String,
      required: [true, 'Password is required'],
    },
  },
  { timestamps: true }
);

// Pre-save hook: hash the password before saving
// Mongoose v9+: async pre-hooks should throw on error (not call next)
userSchema.pre('save', async function () {
  // Only hash if the password field was modified
  if (!this.isModified('hashedPassword')) return;
  const salt = await bcrypt.genSalt(12);
  this.hashedPassword = await bcrypt.hash(this.hashedPassword, salt);
});

/**
 * Instance method to compare a candidate password with the stored hash.
 * @param {string} candidatePassword - The plain-text password to check.
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.hashedPassword);
};

// Never expose the hashed password in JSON responses
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.hashedPassword;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
