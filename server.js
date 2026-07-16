const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

const ROOM_NAME = 'video-room';

io.on('connection', (socket) => {
  console.log('Yeni bir kullanıcı bağlandı:', socket.id);

  socket.on('join', () => {
    const room = io.sockets.adapter.rooms.get(ROOM_NAME);
    const numClients = room ? room.size : 0;

    if (numClients === 0) {
      socket.join(ROOM_NAME);
      socket.emit('created', ROOM_NAME);
      console.log(`Oda oluşturuldu. İlk kullanıcı girdi: ${socket.id}`);
    } else if (numClients === 1) {
      socket.join(ROOM_NAME);
      socket.emit('joined', ROOM_NAME);
      // Odadaki diğer kullanıcıya yeni birinin geldiğini ve bağlantıyı başlatabileceğini haber ver
      socket.to(ROOM_NAME).emit('ready');
      console.log(`İkinci kullanıcı odaya katıldı: ${socket.id}`);
    } else {
      // Odada zaten 2 kişi var, daha fazlasına izin verme
      socket.emit('full', ROOM_NAME);
      console.log(`Oda dolu! ${socket.id} bağlantısı reddedildi.`);
    }
  });

  // WebRTC Sinyalleşme Mesajlarını İletme
  socket.on('candidate', (candidate) => {
    socket.to(ROOM_NAME).emit('candidate', candidate);
  });

  socket.on('offer', (offer) => {
    socket.to(ROOM_NAME).emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    socket.to(ROOM_NAME).emit('answer', answer);
  });

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
    socket.to(ROOM_NAME).emit('peer-disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
