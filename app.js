const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs').promises;

const addedProducts = [];

const app = express();
const port = 2490;

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'food_ordring',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    res.redirect('/');
  } else {
    next();
  }
};

app.get('/Add_product', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/All_products', (req, res) => {
  res.sendFile(path.join(__dirname, 'cart.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'menu.html'));
});

app.get('/home', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'payment.html'));
});


app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const connection = await pool.getConnection();
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await connection.execute('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);
    console.log('User registered:', result.insertId);

    connection.release();
    res.send('User registered successfully!');
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('Internal Server Error: ' + error.message);
  }
});

app.post('/login', async (req, res) => {
  const { loginUsername, loginPassword } = req.body;

  try {
    const connection = await pool.getConnection();
    const [results] = await connection.execute('SELECT * FROM users WHERE username = ?', [loginUsername]);

    if (results.length === 0) {
      res.status(401).send('Invalid login credentials');
      return;
    }

    const user = results[0];
    const passwordMatch = await bcrypt.compare(loginPassword, user.password);

    if (passwordMatch) {
      req.session.userId = user.id;
      res.redirect('/home');
    } else {
      res.status(401).send('Invalid login credentials');
    }

    connection.release();
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Internal Server Error: ' + error.message);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.post('/Add_product', upload.single('productImage'), async (req, res) => {
  const { productName, productID, manufactureName, productDetail, productQuantity } = req.body;
  const productImage = req.file ? req.file.filename : null;

  try {
    const [result] = await pool.execute('INSERT INTO products (product_image, product_name, product_id, manufacture_name, product_detail, quantity) VALUES (?, ?, ?, ?, ?, ?)', [productImage, productName, productID, manufactureName, productDetail, productQuantity]);

    const productId = result.insertId;
    const [lastAddedProduct] = await pool.execute('SELECT * FROM products WHERE id = ?', [productId]);

    addedProducts.push({
      productId: lastAddedProduct[0].id,
      productName: lastAddedProduct[0].product_name,
      productID: lastAddedProduct[0].product_id,
      manufactureName: lastAddedProduct[0].manufacture_name,
      productDetail: lastAddedProduct[0].product_detail,
      productQuantity: lastAddedProduct[0].quantity,
      productImage: lastAddedProduct[0].product_image
    });

    res.redirect('/Add_product');
  } catch (error) {
    console.error('Error adding product:', error);

    if (productImage) {
      await fs.unlink(path.join(__dirname, 'uploads', productImage));
    }

    res.status(500).send('Internal Server Error: ' + error.message);
  }
});

app.get('/getAddedProducts', (req, res) => {
  res.json(addedProducts);
});
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
