// Requirement
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Connection
mongoose.connect("mongodb://127.0.0.1:27017/payme", { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true, })
  .then(() => console.log("Databse is connected"))
  .catch((error) => console.log("Error on connecting database", error.message))
const server = app.listen(8080, () => { console.log("Server is connected", server.address().port) });

// Router
app.use(require("./router/payme"))

