import express from "express";
import pg from "pg";
import env from "dotenv";
import session from "express-session";
import path from "path";
import multer from "multer";
import passport from "passport";
import bcrypt from "bcrypt";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";



env.config();
const app = express();
app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));
app.use(session({
    secret: "topsecret",
    resave: false,
    saveUninitialized: true,
    cookie: {maxAge : 1000 * 60 * 60 } //1hr session time
})
);
const saltRounds = 10;

app.use(passport.initialize());
app.use(passport.session());

const storage = multer.diskStorage({
  destination: "public/uploads/",
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname); // keep .jpg, .png etc
    cb(null, Date.now() + ext);
  }
});

const upload = multer({ storage: storage });

const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.HOST,
    database: process.env.DATABASE,
    password: process.env.PASSWORD,
    port: parseInt(process.env.PORT),
});
db.connect();


app.get("/",async(req,res)=>{
    res.render("index.ejs");
})

app.get("/admin",(req,res)=>{
        if(req.session.isAdmin){
            res.redirect("/admin-home");
        }else{
            res.render("admin-login.ejs");
        }
        
});

app.post("/admin-login",async(req,res)=>{
    const username = req.body.username;
    const password = req.body.password;
    try {
        const result = await db.query("SELECT * FROM admin WHERE username = $1",[username]);
        if(result.rows[0].username === username && result.rows[0].password === password){
            req.session.isAdmin = true
            res.redirect("/admin-home");
        }else{
            res.redirect("/admin");
        }
    } catch (err) {
        console.log(err);
        res.redirect("/admin");
    }
})

app.get("/admin-home", async (req, res) => {
    if (req.session.isAdmin) {
        try {
            const result = await db.query("SELECT * FROM products");
            res.render("admin.ejs", { products: result.rows || [] });
        } catch (err) {
            console.log(err);
            res.render("admin.ejs", { products: [] });
        }
    } else {
        return res.redirect("/admin"); // must log in
    }
});


// Logout
app.get("/admin-logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin");
    });
});

//admin CRUD OPERATIONS products

app.get("/admin/add-products",(req,res)=>{
    if(req.session.isAdmin){
        res.render("admin-add-products.ejs")
    }
})

app.post("/admin/add-products",upload.single("p_image"),async(req,res)=>{
    if(req.session.isAdmin){
        const p_name = req.body.p_name;
        const p_category = req.body.p_category;
        const p_cost = req.body.p_cost;
        const p_image_url = `/uploads/${req.file.filename}`;
        try {
            const result = await db.query("INSERT INTO products (p_name,p_category,p_cost,p_image_url) VALUES ($1,$2,$3,$4) RETURNING * ",[p_name,p_category,p_cost,p_image_url]);
            console.log(result.rows);
            res.redirect("/admin-home");
        } catch (error) {
            console.log(error);
        }
    }else{
        res.redirect("/admin");
    }
});


app.get("/admin/edit-products/:id",async(req,res)=>{
    if(req.session.isAdmin){
        const id = req.params.id;
        const product = await db.query("SELECT * FROM products WHERE id = $1",[id]); 
        res.render("admin-edit-products.ejs",{product:product.rows[0]});
    };
})

app.post("/admin/edit-products/:id", upload.single("p_image"), async (req, res) => {
    if (req.session.isAdmin) {
        const id = req.params.id;
        const p_name = req.body.p_name;
        const p_category = req.body.p_category;
        const p_cost = req.body.p_cost;

        let query, values;

        if (req.file) {
            // if user uploaded a new image
            const p_image_url = `/uploads/${req.file.filename}`;
            query = `UPDATE products 
                     SET p_name = $1, p_category = $2, p_cost = $3, p_image_url = $4 
                     WHERE id = $5 RETURNING *`;
            values = [p_name, p_category, p_cost, p_image_url, id];
        } else {
            // keep old image if no new one uploaded
            query = `UPDATE products 
                     SET p_name = $1, p_category = $2, p_cost = $3 
                     WHERE id = $4 RETURNING *`;
            values = [p_name, p_category, p_cost, id];
        }

        try {
            const result = await db.query(query, values);
            console.log("Updated product:", result.rows[0]);
            res.redirect("/admin-home");
        } catch (error) {
            console.error(error);
            res.send("Error updating product");
        }
    } else {
        res.redirect("/admin");
    }
});

app.get("/admin/delete-products/:id", async (req, res) => {
    const id = req.params.id;
    try {
        await db.query("DELETE FROM products WHERE id = $1", [id]);
        res.redirect("/admin-home"); // go back after delete
    } catch (err) {
        console.log(err);
        res.send("Error deleting product");
    }
});


// auth pages
app.get("/auth_page",(req,res)=>{
    res.render("auth_page.ejs");
});

app.get("/auth/google",passport.authenticate("google",{
    scope:["profile","email"],
}))

app.get("/auth/google/home",passport.authenticate("google",{
    successRedirect: "/home",
    failureRedirect:"/",
}))

passport.use("google", new GoogleStrategy({
    clientID:process.env.GOOGLE_CLIENT_ID,
    clientSecret:process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:process.env.GOOGLE_CALLBACK_URL,
    userProfileURL:process.env.GOOGLE_USER_PROFILE_URL,
},
async(accessToken,refreshToken,profile,cb)=>{
    try {
        const userInfo = await db.query("SELECT * FROM users WHERE email = $1",[profile.email]);
        if((userInfo).rows.length === 0){
            const user = await db.query("INSERT INTO users (email,password,method) VALUES ($1,$2,$3) RETURNING *",[profile.email,profile.id,"google"]);
            return cb(null,user.rows[0]);
        }else{
            return cb(null,userInfo.rows[0]);
        }
    } catch (err) {
        return cb(err)
    }
}
))



app.get("/register",(req,res)=>{
    res.render("register.ejs");
});

app.get("/login",(req,res)=>{
    res.render("login.ejs");
})

app.post("/login",passport.authenticate("local",{
        successRedirect: "/home",
        failureRedirect: "/login",
    })
);

app.post("/register",async (req,res)=>{
    const userEmail = req.body.email;
    const userPassword = req.body.password;
    try {
        const result = await db.query("SELECT * FROM users WHERE email = $1",[userEmail]);
        if(result.rows.length === 0 ){
            bcrypt.hash(userPassword,saltRounds,async(err,hash)=>{
                if(err) return err;
                const userDetails = await db.query("INSERT INTO users (email,password,method) VALUES ($1,$2,$3) RETURNING *",[userEmail,hash,"local"]);
                console.log(userDetails.rows[0]);
                req.login(userDetails.rows[0],(err)=>{
                    if(err) return  console.log(err);
                    res.redirect("/home")
                });
            });
        }else{
            res.redirect("/login");
        }
    } catch (err) {
        console.log(err);
    }
})

passport.use("local", new Strategy(
  { usernameField: "email", passwordField: "password" },
  async function verify(email, password, cb) {
    try {
        const result = await db.query("SELECT * FROM users WHERE email = $1",[email]);
        if(result.rows.length === 0){
            return cb("user not found")
        }else{
            bcrypt.compare(password,result.rows[0].password,(err,valid)=>{
                if(err) return cb(err);
                if(valid){
                    return cb(null,result.rows[0])
                }else {
                    return cb(null,false);
                }
            });
        }    
    } catch (err) {
        return cb(err);
    }
}))

app.get("/logout",(req,res)=>{
    req.logout(function (err){
        if(err){
            return console.log(err);
        }else{
            res.redirect("/");
        }
    })
})


app.get("/home",async(req,res)=>{
    if(req.isAuthenticated()){
    const result = await db.query("SELECT * FROM products");
    res.render("home.ejs",{products:result.rows})
    }else{
        res.redirect("/login");
    }
})



//cart 
app.get("/cart/:id",async(req,res)=>{
    if(req.isAuthenticated()){
        const user_id = req.user.user_id;
        const p_id = req.params.id;
        const cart = await db.query("INSERT INTO cart (user_id,product_id) VALUES ($1,$2) ",[user_id,p_id]);
    }else(
        res.redirect("/")
    )
});

app.get("/view-cart", async (req, res) => {
  if (req.isAuthenticated()) {
    const user_id = req.user.user_id;

    try {
      const result = await db.query(
        `SELECT c.cart_id, p.id, p.p_name, p.p_category, p.p_cost, p.p_image_url
         FROM cart c
         JOIN products p ON c.product_id = p.id
         WHERE c.user_id = $1`,
        [user_id]
      );

      const cartItems = result.rows;

      // ✅ convert p_cost to number
      const total = cartItems.reduce(
        (sum, item) => sum + Number(item.p_cost),
        0
      );

      res.render("view-cart.ejs", { cartItems, total });

    } catch (err) {
      console.error(err);
      res.status(500).send("Error fetching cart");
    }

  } else {
    res.redirect("/");
  }
});


app.post("/remove-cart/:cart_id", async (req, res) => {
  if (req.isAuthenticated()) {
    const user_id = req.user.user_id;
    const cart_id = req.params.cart_id;

    try {
      await db.query(
        "DELETE FROM cart WHERE cart_id = $1 AND user_id = $2",
        [cart_id, user_id]
      );
      res.redirect("/view-cart");
    } catch (err) {
      console.error(err);
      res.status(500).send("Error removing item from cart");
    }

  } else {
    res.redirect("/");
  }
});





passport.serializeUser((user,cb)=>{cb(null,user);});
passport.deserializeUser((user,cb)=>{cb(null,user);});

app.listen(3000,()=>{
    console.log("http://localhost:3000");
});