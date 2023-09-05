const express = require("express");

const router = express.Router();
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");

const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

const findOrCreate = require("mongoose-findorcreate");
const { futimes } = require("fs");

const app = express();
const http = require("http");
const socketIo = require('socket.io');
const server = http.createServer(app);
const io = socketIo(server);


app.set("view engine", "ejs");
app.use(express.static(__dirname + '/public'));

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

  const virtualcartSchema = new mongoose.Schema({
    name : String,
    creatorID : String,
    connections : [{
      connectionid : String,
    }],

    productID : [{
      productid : String,
    }]
  }
  );

  const VirtualCart = new mongoose.model("VirtualCart", virtualcartSchema);

  const chatSchema = new mongoose.Schema({
    sender_id : {
      type : mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    receiver_id : {
      type : mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message : {
      type : String,
      required : true
    }
  },
  {timestamps:true}
  );

  const Chat = new mongoose.model("Chat", chatSchema);


  const merchantSchema = new mongoose.Schema({
    username: String,
    password: String,
    name: String,
    sellername : String,
    is_online : {
      type : String,
      default : "0",
    },
    address : [{
      fullname : String,
      mobilenumber : String,
      houseno : String,
      area : String,
      landmark : String,
      pincode : String,
      city : String,
      state : String,
      country : String,
    }],
    cart : [{
      productid : String,
      name : String,
      img : {type : String},
      price : Number,
      category : String,
      brand : String,
      description : String,
    }],
    products : [{
    name : String,
    price : Number,
    img : { type: String, default: "https://cdn.pixabay.com/photo/2016/01/15/20/08/secret-1142327_640.jpg" },
    category : String,
    brand : String,
    description : String,
    sellername : String,
    sellerid : mongoose.Schema.Types.ObjectId,
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

// var usp = io.of('/home');

// usp.on('connection', function(socket){
//   console.log("user connected");

//   socket.on('disconnect', function(){
//     console.log('Disconnected');
//   })
// });

// var usp = io.of('http://localhost:3000/home');
// usp.on('connection', (socket) => {
//   console.log('A user connected');


//   socket.on('disconnect', () => {
//     console.log('A user disconnected');
//   });
// });



var usp = io.of('/user-namespace');

usp.on('connection', async function(socket){
  console.log("a user connected");

  var userId = socket.handshake.auth.token;

  await Merchant.findByIdAndUpdate({ _id : userId }, {$set : { is_online : '1'}});

  socket.broadcast.emit('getOnlineUser', { user_id : userId });
  socket.on('disconnect', async function(){
    await Merchant.findByIdAndUpdate({ _id : userId }, {$set : { is_online : '0'}});
    console.log("user gets disconnectd");
    socket.broadcast.emit('getOfflineUser', { user_id : userId });
  });


  ////chatting implementation

  socket.on('newChat', function(data){
    socket.broadcast.emit('loadNewChat', data);
  })

  socket.on('existsChat', async function(data){
    var chats = await Chat.find({ $or : [
      {sender_id : data.sender_id, receiver_id : data.receiver_id},
      {sender_id : data.receiver_id, receiver_id : data.sender_id}
    ]});

    console.log(chats);
    socket.emit('loadChats', {chats : chats});
  })
})






/////////////////////Buyer Side///////////////////

merchantSchema.index({ name: 'text', 'sellername': 'text', 'products.name' : 'text', 'products.description' : 'text' });

/////////search route////////
// app.get("/search", async(req, res)=>{
//   const searchTerm = req.body.search;
//   const results = await Merchant.find({
//     $or: [
//       { $text: { $search: searchTerm } }, // Search in product name and description
//       { 'products.text': { $regex: searchTerm, $options: 'i' } }, // Search in comments
//     ],
//   });
//   console.log(results);
// })


app.get('/search', async (req, res) => {
  const searchTerm = req.query.search; // User's search input
  console.log(searchTerm);
  if (!searchTerm) {
    return res.status(400).json({ error: 'Search term is required' });
  }
  try {
    const textSearchResults = await Merchant.find({
      $text: { $search: searchTerm } // Search in merchant name
    });

    const sellerSearchResults = await Merchant.find({
      'sellername': { $regex: searchTerm, $options: 'i' }// Search in merchant name
    });

    const productSearchResults = await Merchant.find({
      'products.name': { $regex: searchTerm, $options: 'i' } // Search in products.name
    });

    const descriptionSearchResults = await Merchant.find({
      'products.description': { $regex: searchTerm, $options: 'i' } // Search in products.description
    });

    // Combine and deduplicate results as needed

    const combinedResults = [
      ...textSearchResults,
      ...sellerSearchResults,
      ...productSearchResults,
      ...descriptionSearchResults
    ];

    const deduplicatedResults = Array.from(new Set(combinedResults));

    var arr = [];

    deduplicatedResults.forEach(user => {
      user.products.forEach(product => {
        arr.push(product);
      });
    });

  

    const shuffledArr = arr.sort(() => Math.random() - 0.5);

    if(deduplicatedResults) res.render("initialPage", {shuffledArr : shuffledArr})
    else res.redirect("/")
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/log/search', async (req, res) => {
  if(req.isAuthenticated()){
    
  const searchTerm = req.query.search; // User's search input
  console.log(searchTerm);
  if (!searchTerm) {
    return res.status(400).json({ error: 'Search term is required' });
  }
  try {
    const textSearchResults = await Merchant.find({
      $text: { $search: searchTerm } // Search in merchant name
    });

    const sellerSearchResults = await Merchant.find({
      'sellername': { $regex: searchTerm, $options: 'i' }// Search in merchant name
    });

    const productSearchResults = await Merchant.find({
      'products.name': { $regex: searchTerm, $options: 'i' } // Search in products.name
    });

    const descriptionSearchResults = await Merchant.find({
      'products.description': { $regex: searchTerm, $options: 'i' } // Search in products.description
    });

    // Combine and deduplicate results as needed

    const combinedResults = [
      ...textSearchResults,
      ...sellerSearchResults,
      ...productSearchResults,
      ...descriptionSearchResults
    ];

    const deduplicatedResults = Array.from(new Set(combinedResults));

    var arr = [];

    deduplicatedResults.forEach(user => {
      user.products.forEach(product => {
        arr.push(product);
      });
    });

  

    const shuffledArr = arr.sort(() => Math.random() - 0.5);

    if(deduplicatedResults) res.render("home", {shuffledArr : shuffledArr})
    else res.redirect("/home")
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
  }

}else{
  res.redirect("/login");
}
});


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

      

        const shuffledArr = arr.sort(() => Math.random() - 0.5);
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

      

        const shuffledArr = arr.sort(() => Math.random() - 0.5);

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

      

        const shuffledArr = arr.sort(() => Math.random() - 0.5);
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
            if(product.category === req.params.categoryName){
              arr.push(product);
            }
            
          });
        });

      

        const shuffledArr = arr.sort(() => Math.random() - 0.5);
        res.render("home", {shuffledArr : shuffledArr});
    }
  );
  }else{
    res.redirect("/login");
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
      //////dont change any thing its value at all //////////

        value.forEach(seller=>{
          seller.products.forEach(product =>{
            if(product.id === req.params.productID){
              var userID = req.user._id;
              console.log(userID);
              res.render("logProductView", {product : product, user : req.user, userID, seller : seller });
            }
          })
        })


    }
  );
  }else{
    res.redirect("/login");
  }
});




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
});

app.get("/editProfile", (req, res)=>{
  if(req.isAuthenticated()){
    res.render("profileEditor", {name : req.user.name, sellername : req.user.sellername, email : req.user.username, web : "seller" });
  }else{
    res.redirect("/login");
  }
})

app.post("/editProfile", async(req, res)=>{
  if(req.isAuthenticated()){
    req.user.name = req.body.name;
    req.user.username = req.body.email;
    req.user.sellername = req.body.sellername;

    await req.user.save();
    res.redirect("/profile");
  }else{
    res.redirect("/login");
  }
})

app.get("/editProfile/merchant", (req, res)=>{
  if(req.isAuthenticated()){
    res.render("profileEditor", {name : req.user.name, sellername : req.user.sellername, email : req.user.username, web:"merchant"});
  }else{
    res.redirect("/merLogin");
  }
})

app.post("/editProfile/merchant", async(req, res)=>{
  if(req.isAuthenticated()){
    req.user.name = req.body.name;
    req.user.username = req.body.email;
    req.user.sellername = req.body.sellername;

    await req.user.save();
    res.redirect("/merProfile");
  }else{
    res.redirect("/merLogin");
  }
})


/////////////////add to cart/////////

app.get("/myCart", (req, res)=>{
  if(req.isAuthenticated()){
    var totalAmount = 0;
    req.user.cart.forEach(product => {
      totalAmount = totalAmount + product.price
    });
    res.render("myCart", {cart : req.user.cart, totalAmount : totalAmount});
  }else{
    res.redirect("/login");
  }
});

app.get("/addToCart/:productID", (req, res)=>{
  if(req.isAuthenticated()){
     const productID = req.params.productID;
    const comment = req.body.comment;
  
    async function myFunction() {
  
      return await Merchant.find({});
    }
    myFunction().then(
     
      async function(value) {

        var name;
        var img;
        var category;
        var brand;
        var description;
        var price;
        var k = 0;
  
          value.forEach(user=>{
            user.products.forEach( (product) =>{
              if(product.id === productID){
                name = product.name;
                img = product.img;
                category = product.category;
                brand = product.brand;
                description = product.description;
                price = product.price;
               
              }
            })
           
          })
  req.user.cart.push({productid : productID, name : name, img : img, category : category, brand : brand, description : description, price: price})
  await req.user.save();
  res.redirect("/myCart");
      }
    );
  }else{
    res.redirect(`/login/${req.params.productID}`);
  }
});


app.get("/deletefromcart/:productID", (req, res)=>{
  if (req.isAuthenticated()){
    console.log("entered");
    var k = 0;
    req.user.cart.forEach(function(product){
      if (product.id === req.params.productID) {
        console.log(product.id);
        async function myFunction() {
          req.user.cart.splice(k, 1);

          await req.user.save();
          console.log("deleted");
  }
  myFunction().then(
   
    function(value) {
      res.redirect("/myCart");
    }
  );
      }
      k++;
    });
  }else {
    res.redirect("/login");
  }
});


/////////buy routes/////////
app.get("/buy/:productID", (req, res)=>{
  if(req.isAuthenticated()){
    const productID = req.params.productID;
  
    async function myFunction() {
  
      return await Merchant.find({});
    }
    myFunction().then(
     
      function(value) {
  
          value.forEach(user=>{
            user.products.forEach(async (product) =>{
              if(product.id === productID){
                
                res.render("addressPage", {addresses : req.user.address, productID : req.params.productID, amount : product.price, productname : product.name});
              }
            })
          })
  
  
      }
    );

    
  }else{
    res.redirect(`/login/${req.params.productID}`)
  }
});

app.get("/addNewAddress/fullCart", (req, res)=>{
  if(req.isAuthenticated()){
    res.render("newAdress", {productID : "fullCart"});
  }else{
    res.redirect("/login");
  }
})

app.post("/addNewAddress/fullCart", async (req, res)=>{
  
  if(req.isAuthenticated()){
    req.user.address.push({fullname : req.body.fullname, mobilenumber : req.body.mobilenumber, houseno : req.body.houseno, area : req.body.area, landmark : req.body.landmark, pincode : req.body.pincode, city : req.body.city, state : req.body.state, country : req.body.country});
    await req.user.save();
    res.redirect("/orderFullCart");
  }else{
    res.redirect("/login")
  }
})

app.get("/addNewAddress/:productID", (req, res)=>{
  if(req.isAuthenticated()){
    res.render("newAdress", {productID : req.params.productID});
  }else{
    res.redirect("/login");
  }
})

app.post("/addNewAddress/:productID", async (req, res)=>{
  
  if(req.isAuthenticated()){
    req.user.address.push({fullname : req.body.fullname, mobilenumber : req.body.mobilenumber, houseno : req.body.houseno, area : req.body.area, landmark : req.body.landmark, pincode : req.body.pincode, city : req.body.city, state : req.body.state, country : req.body.country});
    await req.user.save();
    res.redirect(`/buy/${req.params.productID}`);
  }else{
    res.redirect("/login")
  }
})


/////order Full Cart/////////
app.get("/orderFullCart", (req, res)=>{
  var productArray = []
  if(req.isAuthenticated()){
    var amount = 0;
    req.user.cart.forEach(product => {
      amount = amount + product.price;
      productArray.push(product.productid);
      
    });

    res.render("orderFullCart", {cart : req.user.cart, amount : amount, addresses : req.user.address})
  }else{
    res.redirect("/login");
  }
})

////////////login for shoppers////////
app.get("/login", function (req, res) {
  res.render("login", {productID : "not"});
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


app.get("/login/:productID", (req, res)=>{
  res.render("login", {productID : req.params.productID} );
})

app.post("/login/:productID", (req, res) => {
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
          res.redirect(`/log/fullview/${req.params.productID}`);
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
////////////////////////MERCHANT SIDE///////////////////////////////////////////////////////////////////////////

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

    console.log(req.user.id);
    const sellerid = req.user.id;

    if(req.isAuthenticated()){
      const product = {
        name : name,
        price : price,
        img : imgLink,
        category : category,
        brand : brand,
        description : description,
        sellername : req.user.sellername,
        sellerid : sellerid,
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


  app.get("/merChat", function(req, res){
    if(req.isAuthenticated()){
      async function myFunction() {

          return await Merchant.find({});
        }

        myFunction().then(
          function(merchants){
              res.render("merChat", {merchants : merchants, userID : req.user._id});
          }
        )
      
      
  }else{
      res.redirect("/merLogin")
  }
  });

  app.post("/save-chat", async function(req, res){
    if(req.isAuthenticated()){

      
      try{
        var chat = new Chat({
          sender_id : req.body.sender_id,
          receiver_id : req.body.receiver_id,
          message : req.body.message,
        })

        var newChat = await chat.save();
        res.status(200).send({success : true, msg: "Chat inserted", data:newChat });
      }catch(error){
        res.status(400).send({success : false, msg : error.message});
      }
    }else{
      res.redirect("/login");
    }
  });

  app.get("/delete-chat/:deleteID", async function(req, res){
    if(req.isAuthenticated()){
      var chatID = req.params.deleteID;
      await Chat.findByIdAndDelete(chatID);
      res.redirect('back');
    }else{
      res.redirect("/login");
    }
  })


//////////////////////////MERCHANT SIDE ENDS///////////



///////Virtual Cart/////////
app.get("/virtualCart", async function(req, res){
  if(req.isAuthenticated()){
    var virtualCarts = await VirtualCart.find({});
    res.render("virtualCart", {virtualCarts : virtualCarts});
  }else{
    res.redirect("/login");
  }
});

// app.get("/createVirtualCart", function(req, res){

// })

server.listen(3000, function () {
    console.log("Server started on port 3000.");
  });