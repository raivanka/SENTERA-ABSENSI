const API_URL = "https://script.google.com/macros/s/AKfycbzUNayLthLLRwfms4CQHTqTKj3lKhyrhWwb7mOIbMHEIM4HkC0jbwVgy-MYJaV1WxNXcQ/exec";
let isProcessing = false;
let html5QrCode = null;
let currentFacingMode = "environment";

function getQrboxSize() {
  return window.innerWidth < 640 ? 250 : 280;
}

function onScanSuccess(decodedText) {
  if (isProcessing) return; // Mencegah scan ganda secara tidak sengaja
  isProcessing = true;

  const statusBox = document.getElementById("status-box");
  const statusText = document.getElementById("status-text");

  statusBox.classList.remove("hidden", "bg-emerald-500/20", "text-emerald-400", "bg-rose-500/20", "text-rose-400");
  statusBox.classList.add("bg-amber-500/20", "text-amber-400");
  statusText.innerText = "⏳ Memproses data absensi...";

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "scanQR", qrData: decodedText })
  })
  .then(res => res.json())
  .then(data => {
    statusBox.classList.remove("bg-amber-500/20", "text-amber-400");

    if (data.status === "success") {
      statusBox.classList.add("bg-emerald-500/20", "text-emerald-400");
      statusText.innerText = "✅ " + data.message;
    } else {
      statusBox.classList.add("bg-rose-500/20", "text-rose-400");
      statusText.innerText = "❌ " + (data.message || "Gagal mencatat absensi");
    }

    // Beri jeda 3 detik sebelum siap scan siswa berikutnya
    setTimeout(() => {
      statusBox.classList.add("hidden");
      isProcessing = false;
    }, 3000);
  })
  .catch(err => {
    statusBox.classList.remove("bg-amber-500/20", "text-amber-400");
    statusBox.classList.add("bg-rose-500/20", "text-rose-400");
    statusText.innerText = "❌ Terjadi kesalahan jaringan!";
    
    setTimeout(() => {
      statusBox.classList.add("hidden");
      isProcessing = false;
    }, 3000);
  });
}

function onScanError(error) {
  // Scan error (no QR found) — normal during scanning, silently ignored
}

async function startScanner(facingMode) {
  const startBtn = document.getElementById("start-camera-btn");
  if (startBtn) startBtn.style.display = "none";

  const placeholder = document.getElementById("reader-placeholder");
  if (placeholder) placeholder.style.display = "none";

  const reader = document.getElementById("reader");
  if (reader) {
    reader.classList.remove("flex", "items-center", "justify-center", "border-dashed");
    reader.classList.add("border-solid", "border-emerald-500/20");
  }

  if (html5QrCode) {
    try { await html5QrCode.stop(); } catch(e) {}
    try { await html5QrCode.clear(); } catch(e) {}
  }

  try {
    html5QrCode = new Html5Qrcode("reader");

    const qrboxSize = getQrboxSize();
    await html5QrCode.start(
      { facingMode: facingMode },
      {
        fps: 10,
        qrbox: { width: qrboxSize, height: qrboxSize }
      },
      onScanSuccess,
      onScanError
    );

    updateCameraIndicator();

    const frame = document.getElementById("scan-frame");
    if (frame) frame.classList.remove("hidden");

    const statusLabel = document.getElementById("camera-label");
    if (statusLabel) {
      statusLabel.innerText = currentFacingMode === "environment" ? "Belakang" : "Depan";
      statusLabel.classList.add("text-emerald-400");
    }
  } catch (err) {
    console.error("Error starting scanner:", err);

    if (startBtn) {
      startBtn.style.display = "flex";
      startBtn.innerHTML = '<span class="material-symbols-outlined text-3xl text-rose-400 mb-2">error</span><span class="text-sm font-medium text-rose-400">Kamera Gagal</span><span class="text-xs text-slate-400 mt-1">' + (err.message || "Akses kamera ditolak") + '</span>';
    }

    const statusLabel = document.getElementById("camera-label");
    if (statusLabel) {
      statusLabel.innerText = "Kamera gagal";
      statusLabel.classList.remove("text-emerald-400");
    }

    const frame = document.getElementById("scan-frame");
    if (frame) frame.classList.add("hidden");
  }
}

function startScannerWithGesture() {
  if (!window.Html5Qrcode) {
    const startBtn = document.getElementById("start-camera-btn");
    if (startBtn) {
      startBtn.innerHTML = '<span class="material-symbols-outlined text-3xl text-rose-400 mb-2">error</span><span class="text-sm font-medium text-rose-400">Library Error</span><span class="text-xs text-slate-400">html5-qrcode tidak terload</span>';
    }
    return;
  }
  startScanner(currentFacingMode);
}

function flipCamera() {
  if (!html5QrCode) return;

  const flipBtn = document.getElementById("flip-camera-btn");
  if (flipBtn) flipBtn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span>';

  html5QrCode.stop().then(function() {
    currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
    startScanner(currentFacingMode);
    if (flipBtn) flipBtn.innerHTML = '<span class="material-symbols-outlined text-base">cameraswitch</span>';
  }).catch(function(err) {
    console.error("Error flipping camera:", err);
    if (flipBtn) flipBtn.innerHTML = '<span class="material-symbols-outlined text-base">cameraswitch</span>';
    const label = document.getElementById("camera-label");
    if (label) label.innerText = "Gagal ganti kamera";
  });
}

function updateCameraIndicator() {
  const label = document.getElementById("camera-label");
  if (label) {
    label.innerText = currentFacingMode === "environment" ? "Belakang" : "Depan";
  }
}
