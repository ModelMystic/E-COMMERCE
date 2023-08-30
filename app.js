const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");

const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

const findOrCreate = require("mongoose-findorcreate");
const { futimes } = require("fs");

const app = express();

app.use(express.static("public"));

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
    session({
      secret: "our little secret",
      resave: false,
      saveUninitialized: false,
    })
  );
  
  app.use(passport.initialize());
  app.use(passport.session());
  
  mongoose.connect("mongodb://localhost:27017/commerceDB");


  const merchantSchema = new mongoose.Schema({
    username: String,
    password: String,
    name: String,
    sellername : String,
    products : [{
    name : String,
    price : String,
    img : { type: String, default: "https://cdn.pixabay.com/photo/2016/01/15/20/08/secret-1142327_640.jpg" },
    category : String,
    brand : String,
    description : String,
    comment : [{
      commentername : String,
      comm : String
    }]
}]
  });

merchantSchema.plugin(passportLocalMongoose);
merchantSchema.plugin(findOrCreate);



const Merchant = new mongoose.model("Merchant", merchantSchema);



passport.use(Merchant.createStrategy());

passport.serializeUser((User, done) => {
    done(null, User.id);
  });
  
passport.deserializeUser(async (id, done) => {
    const USER = await Merchant.findById(id);
    done(null, USER);
  });



/////////////////////Buyer Side///////////////////

///initial Page/////
app.get("/", function (req, res) {
  var arr = [];
  async function myFunction() {

    return await Merchant.find({"products": {$ne : null}} );
  }
  myFunction().then(
   
    function(value) {
        value.forEach(user => {
          user.products.forEach(product => {
            arr.push(product);
          });
        });
        console.log(arr);
      

        const shuffledArr = arr.sort(() => Math.random() - 0.5);
        console.log(shuffledArr);
        res.render("initialPage", {shuffledArr : shuffledArr});
    }
  );
});


//////home page///////
app.get("/home", (req, res)=>{
  if(req.isAuthenticated()){
    var arr = [];
  async function myFunction() {

    return await Merchant.find({"products": {$ne : null}} );
  }
  myFunction().then(
   
    function(value) {
        value.forEach(user => {
          user.products.forEach(product => {
            arr.push(product);
          });
        });
        console.log(arr);
      

        const shuffledArr = arr.sort(() => Math.random() - 0.5);
        console.log(shuffledArr);
        res.render("home", {shuffledArr : shuffledArr});
    }
  );
  }else{
    res.redirect("/login");
  }
})



//////category wise searching//////////
app.get("/category/:categoryName", (req, res)=>{
  var arr = [];
  async function myFunction() {

    return await Merchant.find({"products": { $elemMatch: {
      "category": req.params.categoryName
    }}} );
  }
  myFunction().then(
   
    function(value) {
        value.forEach(user => {
          user.products.forEach(product => {
            arr.push(product);
          });
        });
        console.log(arr);
      

        const shuffledArr = arr.sort(() => Math.random() - 0.5);
        console.log(shuffledArr);
        res.render("initialPage", {shuffledArr : shuffledArr});
    }
  );
})

app.get("/log/category/:categoryName", (req, res)=>{
  if(req.isAuthenticated()){
  var arr = [];
  async function myFunction() {

    return await Merchant.find({"products": { $elemMatch: {
      "category": req.params.categoryName
    }}} );
  }
  myFunction().then(
   
    function(value) {
        value.forEach(user => {
          user.products.forEach(product => {
            arr.push(product);
          });
        });
        console.log(arr);
      

        const shuffledArr = arr.sort(() => Math.random() - 0.5);
        console.log(shuffledArr);
        res.render("home", {shuffledArr : shuffledArr});
    }
  );
  }else{
    res.redirect("/initialPage");
  }
});


/////////product full view///////////

app.get("/fullview/:productID", function(req, res){
  async function myFunction() {

    return await Merchant.find({"products": {$ne : null}} );
  }
  myFunction().then(
   
    function(value) {

        value.forEach(user=>{
          user.products.forEach(product =>{
            if(product.id === req.params.productID){
              res.render("productView", {product : product});
            }
          })
        })


    }
  );

})

app.get("/log/fullview/:productID", function(req, res){
  if(req.isAuthenticated()){
  async function myFunction() {

    return await Merchant.find({"products": {$ne : null}} );
  }
  myFunction().then(
   
    function(value) {

        value.forEach(user=>{
          user.products.forEach(product =>{
            if(product.id === req.params.productID){
              res.render("logProductView", {product : product});
            }
          })
        })


    }
  );
  }else{
    res.redirect("/login");
  }
})

///////comment handling///////

app.post("/comment/:productID", async (req, res) => {
  if(req.isAuthenticated()){

    const productID = req.params.productID;
    const comment = req.body.comment;
  
    async function myFunction() {
  
      return await Merchant.find({});
    }
    myFunction().then(
     
      function(value) {
  
          value.forEach(user=>{
            user.products.forEach(async (product) =>{
              if(product.id === productID){
                product.comment.push({ commentername: req.user.name , comm : comment});
                await user.save();
                res.redirect(`/fullview/${req.params.productID}`);
              }
            })
          })
  
  
      }
    );
  }else{
    res.redirect("/login");
  }
})

///////profile//////

app.get("/profile", (req, res)=>{
  if(req.isAuthenticated()){
      res.render("profile", {
          name : req.user.name,
          sellername : req.user.sellername,
          email : req.user.username,
          noOfProducts : req.user.products.length
      })
  }else{
      res.redirect("/login");
  }
})

////////////login for shoppers////////
app.get("/login", function (req, res) {
  res.render("login");
});

app.post("/login", (req, res) => {
  const user = new Merchant({
    username: req.body.username,
    password: req.body.password,
  });

  req.login(user, function (err) {
    if (err) {
      console.log(err);
    } else {
      passport.authenticate("local", { failureRedirect: "/login" })(
        req,
        res,
        function () {
          res.redirect("/home");
        }
      );
    }
  });
});

app.get("/register", function (req, res) {
  res.render("register");
});

app.post("/register", (req, res) => {
  Merchant.register(
    { username: req.body.username, name: req.body.name },
    req.body.password,
    function (err, user) {
      if (err) {
        console.log(err);
        res.redirect("/register");
      } else {
        passport.authenticate("local")(req, res, function () {
          res.redirect("/home");
        });
      }
    }
  );
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});
////////////////////////MERCHANT SIDE/////////////

app.get("/merHome", (req, res)=>{
    if(req.isAuthenticated()){
        async function myFunction() {

            return await Merchant.find({});
          }

          myFunction().then(
            function(merchants){
                res.render("merHome", {merchants : merchants});
            }
          )
        
        
    }else{
        res.redirect("/merLogin")
    }
})

app.get("/merchant", (req, res)=>{
    res.render("merInitial");
});


////////new product////////////
app.get("/newProduct", (req, res)=>{
    if(req.isAuthenticated()){
        res.render("newProduct");
    }else{
        res.redirect("/merLogin")
    }
    
})

app.post("/newProduct", async function(req, res){
    const name = req.body.productName;
    const price = req.body.productPrice;
    const imgLink = req.body.imgLink;
    const category = req.body.productCategory;
    const brand = req.body.brandName;
    const description = req.body.description;

    if(req.isAuthenticated()){
      const product = {
        name : name,
        price : price,
        img : imgLink,
        category : category,
        brand : brand,
        description : description
      }
      await Merchant.findByIdAndUpdate(req.user.id, { $push : {products : product}}) ;  
      res.redirect("/merHome");   
    }else{
      res.redirect("/merLogin");
    }
})


////////my product////
app.get("/myProducts", async (req, res)=>{
  if(req.isAuthenticated()){
    res.render("myProducts", {products : req.user.products});
  }else{
    res.redirect("/merLogin");
  }
});

app.get("/deleteProduct/:productID", function(req, res){
    if (req.isAuthenticated()){
      var k = 0;
      req.user.products.forEach(function(product){
        if (product.id === req.params.productID) {
          async function myFunction() {
            req.user.products.splice(k, 1);
  
            await req.user.save();
    }
    myFunction().then(
     
      function(value) {
        res.redirect("/myProducts");
      }
    );
        }
        k++;
      });
    }else {
      res.redirect("/merLogin");
    }
  });

  app.get("/myProduct/:productID", function(req, res){
  
    if (req.isAuthenticated()){
        var p = 0;
        req.user.products.forEach(function(product){
      
          if (product.id === req.params.productID) {
            
            res.render("productEditor", {
              img : product.img,
              name: product.name,
              description: product.description,
              productID : req.params.productID,
              category : product.category,
              brand : product.brand,
              price : product.price,
              comments : product.comment
            });
            p = 1;
          }
        });
  
        if(p===0){
          res.redirect("/myProducts");
        }
      }
    else{
      res.redirect("/merLogin");
    }
  })

  app.post("/update/:productID", function(req, res){

    if (req.isAuthenticated()){
      req.user.products.forEach(function(product){
        if (product.id === req.params.productID) {
          async function myFunction() {
  
            if(req.body.imageLink){
              product.img = req.body.imageLink
            }
            
            product.name = req.body.name;
            product.price = req.body.price;
            product.brand = req.body.brand;
            product.category = req.body.category;
            product.description = req.body.description;
  
            await req.user.save();
    }
    myFunction().then(
     
      function(value) {
        res.redirect("/myProducts");
      }
    );
        }
      });
    }else {
      res.redirect("/merLogin");
    }
  })

////////////merProfile///////////////////
app.get("/merProfile", (req, res)=>{
    if(req.isAuthenticated()){
        res.render("merProfile", {
            name : req.user.name,
            sellername : req.user.sellername,
            email : req.user.username,
            noOfProducts : req.user.products.length
        })
    }else{
        res.redirect("/merLogin");
    }
})

app.get("/merLogin", function (req, res) {
    res.render("merLogin");
  });

app.get("/merRegister", function (req, res) {
    res.render("merRegister");
  });

  app.post("/merRegister", (req, res) => {
    Merchant.register(
      { username: req.body.username, name: req.body.name, sellername : req.body.sellername },
      req.body.password,
      function (err, user) {
        if (err) {
          console.log(err);
          res.redirect("/merRegister");
        } else {
          passport.authenticate("local")(req, res, function () {
            res.redirect("/merHome");
          });
        }
      }
    );
  });


 app.post("/merLogin", (req, res) => {
    const user = new Merchant({
      username: req.body.username,
      password: req.body.password,
    });
  
    req.login(user, function (err) {
      if (err) {
        console.log(err);
      } else {
        passport.authenticate("local", { failureRedirect: "/merLogin" })(
          req,
          res,
          function () {
            res.redirect("/merHome");
          }
        );
      }
    });
  });

  app.get("/merLogout", (req, res) => {
    req.logout(function (err) {
      if (err) {
        return next(err);
      }
      res.redirect("/merchant");
    });
  });


//////////////////////////MERCHANT SIDE ENDS///////////

app.listen(3000, function () {
    console.log("Server started on port 3000.");
  });