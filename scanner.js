let isProcessing = false;
let html5QrCode = null;
let currentFacingMode = "environment";
let currentCameraDeviceId = null;
let isTorchOn = false;

function getQrboxSize() {
  return window.innerWidth < 640 ? 220 : 240;
}

// Sound Beep
function playBeepSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.15);
  } catch(e) {}
}

function onScanSuccess(decodedText) {
  if (isProcessing) return;
  isProcessing = true;

  const statusBox = document.getElementById("status-box");
  const statusText = document.getElementById("status-text");

  statusBox.className = "p-4 rounded-xl text-center font-bold text-xs shadow-sm border bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 block";
  statusText.innerText = "⏳ Memproses data absensi...";

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "scanQR", qrData: decodedText })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === "success") {
      playBeepSound();
      statusBox.className = "p-4 rounded-xl text-center font-bold text-xs shadow-sm border bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 block";
      statusText.innerText = "✅ " + data.message;
    } else {
      statusBox.className = "p-4 rounded-xl text-center font-bold text-xs shadow-sm border bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30 block";
      statusText.innerText = "❌ " + (data.message || "Gagal mencatat absensi");
    }

    setTimeout(() => {
      statusBox.className = "hidden";
      isProcessing = false;
    }, 3000);
  })
  .catch(err => {
    statusBox.className = "p-4 rounded-xl text-center font-bold text-xs shadow-sm border bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30 block";
    statusText.innerText = "❌ Terjadi kesalahan jaringan!";
    
    setTimeout(() => {
      statusBox.className = "hidden";
      isProcessing = false;
    }, 3000);
  });
}

function onScanError(error) {
  // Ignored
}

// FUNGSI MEMUAT DAFTAR PERANGKAT KAMERA DI HP
function populateCameraList() {
  Html5Qrcode.getCameras().then(devices => {
    const select = document.getElementById("camera-select");
    if (!select) return;
    
    if (devices && devices.length) {
      select.innerHTML = "";
      devices.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.id;
        option.text = device.label || `Kamera ${index + 1}`;
        if (currentCameraDeviceId === device.id) option.selected = true;
        select.appendChild(option);
      });
    } else {
      select.innerHTML = '<option value="">Mode Kamera Otomatis</option>';
    }
  }).catch(() => {
    const select = document.getElementById("camera-select");
    if (select) select.innerHTML = '<option value="">Mode Kamera Otomatis</option>';
  });
}

async function startScanner(cameraSource) {
  const startBtn = document.getElementById("start-camera-btn");

  if (html5QrCode) {
    try { await html5QrCode.stop(); } catch(e) {}
    try { await html5QrCode.clear(); } catch(e) {}
  }

  html5QrCode = new Html5Qrcode("reader");

  const config = {
    fps: 10,
    qrbox: { width: getQrboxSize(), height: getQrboxSize() }
  };

  // Tentukan sumber kamera (per Device ID spesifik atau facingMode)
  const cameraConfig = typeof cameraSource === "string" && cameraSource.length > 20
    ? { deviceId: { exact: cameraSource } }
    : { facingMode: cameraSource || "environment" };

  try {
    await html5QrCode.start(cameraConfig, config, onScanSuccess, onScanError);
    if (startBtn) startBtn.style.display = "none";
    document.getElementById("scan-frame")?.classList.remove("hidden");
    populateCameraList();
  } catch (err) {
    try {
      await html5QrCode.start({ facingMode: "user" }, config, onScanSuccess, onScanError);
      if (startBtn) startBtn.style.display = "none";
      document.getElementById("scan-frame")?.classList.remove("hidden");
    } catch (err2) {
      if (startBtn) {
        startBtn.style.display = "flex";
        startBtn.innerHTML = `
          <span class="material-symbols-outlined text-3xl text-rose-500 mb-1">error</span>
          <span class="text-xs font-bold text-rose-500">Kamera Diblokir</span>
        `;
      }
    }
  }
}

function startScannerWithGesture() {
  if (!window.Html5Qrcode) return;
  startScanner(currentCameraDeviceId || currentFacingMode);
}

function changeCameraDevice(deviceId) {
  if (!deviceId) return;
  currentCameraDeviceId = deviceId;
  startScanner(deviceId);
}

function flipCamera() {
  if (!html5QrCode) return;
  const flipBtn = document.getElementById("flip-camera-btn");
  if (flipBtn) flipBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-base">sync</span>';

  html5QrCode.stop().then(function() {
    currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
    currentCameraDeviceId = null;
    startScanner(currentFacingMode);
    if (flipBtn) flipBtn.innerHTML = '<span class="material-symbols-outlined text-base">cameraswitch</span>';
  }).catch(function() {
    if (flipBtn) flipBtn.innerHTML = '<span class="material-symbols-outlined text-base">cameraswitch</span>';
  });
}

function toggleTorch() {
  if (!html5QrCode) return;
  isTorchOn = !isTorchOn;
  html5QrCode.applyVideoConstraints({ advanced: [{ torch: isTorchOn }] }).catch(() => {});
}

// FITUR UNTUK SCAN GAMBAR BARCODE / QR DARI FILE GALERI
function scanFromFile(inputElement) {
  if (!inputElement.files || inputElement.files.length === 0) return;
  
  const imageFile = inputElement.files[0];
  const fileQrScanner = new Html5Qrcode("reader");

  fileQrScanner.scanFile(imageFile, true)
    .then(decodedText => {
      onScanSuccess(decodedText);
      fileQrScanner.clear();
    })
    .catch(err => {
      const statusBox = document.getElementById("status-box");
      const statusText = document.getElementById("status-text");
      statusBox.className = "p-4 rounded-xl text-center font-bold text-xs shadow-sm border bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30 block";
      statusText.innerText = "❌ Gambar QR Code tidak terbaca!";
      
      setTimeout(() => {
        statusBox.className = "hidden";
      }, 3000);
      fileQrScanner.clear();
    });
}