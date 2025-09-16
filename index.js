import express from "express";
import pg from "pg";
import env from "dotenv";
import session from "express-session";
import path from "path";
import multer from "multer";



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





app.listen(3000,()=>{
    console.log("http://localhost:3000");
});