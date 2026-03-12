const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// REGISTER USER
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    console.log("Register Request:", req.body);

    // check existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ msg: "Email already exists" });

    // hash password
    const hash = await bcrypt.hash(password, 10);

    // create user
    const newUser = await User.create({
      name,
      email,
      passwordHash: hash,
      role
    });

    res.status(201).json({ msg: "User registered successfully", id: newUser._id });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
};

// LOGIN USER
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login Request:", req.body);

    // check user
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "User not found" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ msg: "Incorrect Password" });

    // jwt token
    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({ token, id: user._id, role: user.role, name: user.name });

  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Server error" });
  }
};
