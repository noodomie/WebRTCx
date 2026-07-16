const socket = io();

// HTML Elementleri
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const waitingPlaceholder = document.getElementById('waitingPlaceholder');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const hangupBtn = document.getElementById('hangupBtn');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');

// WebRTC ve Medya Değişkenleri
let localStream;
let remoteStream;
let peerConnection;
let isAudioMuted = false;
let isVideoStopped = false;

// Ücretsiz STUN Sunucusu (Bağlantı kurmayı sağlar)
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Sayfa yüklendiğinde otomatik olarak başlat
async function init() {
  try {
    // 1. Kamera ve Mikrofon İzinlerini Al (Mobil uyumlu constraints)
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user', // Ön kamera öncelikli
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: true
    });
    
    localVideo.srcObject = localStream;
    
    // 2. Sunucuya Bağlan (Odaya giriş isteği gönder)
    socket.emit('join');

  } catch (error) {
    console.error('Kamera veya mikrofon erişim hatası:', error);
    showModal('Medya Hatası', 'Görüntülü konuşma yapabilmek için kamera ve mikrofon izinlerini vermeniz gerekmektedir.');
  }
}

// WebRTC Peer Connection Kurulumu
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(iceServers);

  // Yerel akışı (kendi kameramız) karşı tarafa gönderilecek şekilde ekle
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Karşı taraftan gelen akışı dinle
  peerConnection.ontrack = (event) => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
      remoteVideo.srcObject = remoteStream;
    }
    remoteStream.addTrack(event.track);
    
    // Akış bağlandığı an bekleme ekranını gizle
    waitingPlaceholder.classList.add('opacity-0', 'pointer-events-none');
  };

  // ICE adaylarını (network adayları) sunucu üzerinden karşıya ilet
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('candidate', event.candidate);
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      handlePeerDisconnect();
    }
  };
}

// Sinyalleşme Olay Dinleyicileri (Socket.io)
socket.on('created', (room) => {
  console.log('Oda kuruldu, partner bekleniyor...');
});

socket.on('joined', (room) => {
  console.log('Odaya katıldınız.');
});

// Oda zaten 2 kişiyle doluysa tetiklenir
socket.on('full', () => {
  showModal('Oda Dolu', 'Bu görüşmede şu an maksimum katılımcı (2 kişi) sınırına ulaşıldı.');
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
});

// İkinci kişi girdiğinde ilk kişiye 'ready' gelir, aramayı o başlatır (Offer gönderir)
socket.on('ready', async () => {
  createPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('offer', offer);
});

// Karşı tarafın teklifini (Offer) al ve cevap (Answer) üret
socket.on('offer', async (offer) => {
  if (!peerConnection) createPeerConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', answer);
});

// Karşı tarafın cevabını (Answer) al
socket.on('answer', async (answer) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

// ICE adayı geldiğinde ekle
socket.on('candidate', async (candidate) => {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (e) {
    console.error('ICE adayı eklenirken hata oluştu:', e);
  }
});

// Diğer kullanıcı çıktığında arayüzü sıfırla
socket.on('peer-disconnected', () => {
  handlePeerDisconnect();
});

function handlePeerDisconnect() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  remoteStream = null;
  waitingPlaceholder.classList.remove('opacity-0', 'pointer-events-none');
}

// --- Arayüz ve Buton İşlevleri ---

// Mikrofon Aç/Kapat
toggleMicBtn.addEventListener('click', () => {
  isAudioMuted = !isAudioMuted;
  localStream.getAudioTracks()[0].enabled = !isAudioMuted;
  toggleMicBtn.classList.toggle('bg-rose-600', isAudioMuted);
  toggleMicBtn.querySelector('i').classList.toggle('fa-microphone', !isAudioMuted);
  toggleMicBtn.querySelector('i').classList.toggle('fa-microphone-slash', isAudioMuted);
});

// Kamera Aç/Kapat
toggleCamBtn.addEventListener('click', () => {
  isVideoStopped = !isVideoStopped;
  localStream.getVideoTracks()[0].enabled = !isVideoStopped;
  toggleCamBtn.classList.toggle('bg-rose-600', isVideoStopped);
  toggleCamBtn.querySelector('i').classList.toggle('fa-video', !isVideoStopped);
  toggleCamBtn.querySelector('i').classList.toggle('fa-video-slash', isVideoStopped);
});

// Görüşmeyi Sonlandır / Sayfayı Kapat
hangupBtn.addEventListener('click', () => {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  handlePeerDisconnect();
  socket.disconnect();
  showModal('Görüşme Sonlandırıldı', 'Görüşmeden başarıyla ayrıldınız.');
});

// Tam Ekran Butonu (Mobil Tarayıcılar İçin Optimize Edildi)
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
      .then(() => {
        fullscreenBtn.innerHTML = '<i class="fa-solid fa-compress text-sm"></i>';
      })
      .catch((err) => console.error("Tam ekran hatası:", err));
  } else {
    document.exitFullscreen();
    fullscreenBtn.innerHTML = '<i class="fa-solid fa-expand text-sm"></i>';
  }
});

// Bilgilendirme Modalı Gösterimi
function showModal(title, desc) {
  modalTitle.textContent = title;
  modalDesc.textContent = desc;
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.add('opacity-100');
    modal.firstElementChild.classList.remove('scale-90');
    modal.firstElementChild.classList.add('scale-100');
  }, 50);
}

// Başlat
init();
