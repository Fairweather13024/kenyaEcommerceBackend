import http from 'http';
import { Server } from 'socket.io';
import express from 'express';
import cors from "cors";
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import productRouter from './routers/productRouter.js';
import userRouter from './routers/userRouter.js';
import orderRouter from './routers/orderRouter.js';
import uploadRouter from './routers/uploadRouter.js';
// const morgan = require("morgan");
// require("dotenv").config();
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/<name of db>', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
}).then(() => console.log('*****DB CONNECTED******')).catch((err) => console.log("DB ERROR => ", err));

//Fairweather added
// apply middlewares
app.use(cors()); // allows server proxy
app.use(express.json({limit: "2mb"})); //file uploads
// app.use(morgan("dev"));

//routes
//better way
//readdirSync("./routes").map((r) => app.use("/api", require(`./routes/${r}`))); 

app.use('/api/uploads', uploadRouter);
app.use('/api/users', userRouter);
app.use('/api/products', productRouter);
app.use('/api/orders', orderRouter);


app.get('/api/config/paypal', (req, res) => {
  res.send(process.env.PAYPAL_CLIENT_ID || 'sb');
});
app.get('/api/config/google', (req, res) => {
  res.send(process.env.GOOGLE_API_KEY || '');
});
const __dirname = path.resolve();
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

//Frontend build for react. We will use a frontend proxy instead for nextjs
// app.use(express.static(path.join(__dirname, '/frontend/build')));

//SErving frontend in rect. Again we will use a proxy

// app.get('*', (req, res) =>
//   res.sendFile(path.join(__dirname, '/frontend/build/index.html'))
// );


// app.get('/', (req, res) => {
//   res.send('Server is ready');
// });

app.use((err, req, res, next) => {
  res.status(500).send({ message: err.message });
});

const port = process.env.PORT || 5000;

const httpServer = http.Server(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const users = [];

io.on('connection', (socket) => {
  console.log('connection', socket.id);
  socket.on('disconnect', () => {
    const user = users.find((x) => x.socketId === socket.id);
    if (user) {
      user.online = false;
      console.log('Offline', user.name);
      const admin = users.find((x) => x.isAdmin && x.online);
      if (admin) {
        io.to(admin.socketId).emit('updateUser', user);
      }
    }
  });
  socket.on('onLogin', (user) => {
    const updatedUser = {
      ...user,
      online: true,
      socketId: socket.id,
      messages: [],
    };
    const existUser = users.find((x) => x._id === updatedUser._id);
    if (existUser) {
      existUser.socketId = socket.id;
      existUser.online = true;
    } else {
      users.push(updatedUser);
    }
    console.log('Online', user.name);
    const admin = users.find((x) => x.isAdmin && x.online);
    if (admin) {
      io.to(admin.socketId).emit('updateUser', updatedUser);
    }
    if (updatedUser.isAdmin) {
      io.to(updatedUser.socketId).emit('listUsers', users);
    }
  });

  socket.on('onUserSelected', (user) => {
    const admin = users.find((x) => x.isAdmin && x.online);
    if (admin) {
      const existUser = users.find((x) => x._id === user._id);
      io.to(admin.socketId).emit('selectUser', existUser);
    }
  });

  socket.on('onMessage', (message) => {
    if (message.isAdmin) {
      const user = users.find((x) => x._id === message._id && x.online);
      if (user) {
        io.to(user.socketId).emit('message', message);
        user.messages.push(message);
      }
    } else {
      const admin = users.find((x) => x.isAdmin && x.online);
      if (admin) {
        io.to(admin.socketId).emit('message', message);
        const user = users.find((x) => x._id === message._id && x.online);
        user.messages.push(message);
      } else {
        io.to(socket.id).emit('message', {
          name: 'Admin',
          body: 'Sorry. I am not online right now',
        });
      }
    }
  });
});

httpServer.listen(port, () => {
  console.log(`Serve at http://localhost:${port}`);
});

// app.listen(port, () => {
//   console.log(`Serve at http://localhost:${port}`);
// });
