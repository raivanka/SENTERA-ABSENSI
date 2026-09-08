const API_URL = "https://script.google.com/macros/s/AKfycbzUNayLthLLRwfms4CQHTqTKj3lKhyrhWwb7mOIbMHEIM4HkC0jbwVgy-MYJaV1WxNXcQ/exec";

function loadDashboardData() {
  // 1. Fetch Ringkasan Statistik
  fetch(`${API_URL}?action=getRekap`)
    .then(res => res.json())
    .then(data => {
      document.getElementById('stat-total').innerText = data.total || 0;
      document.getElementById('stat-hadir').innerText = data.hadir || 0;
      document.getElementById('stat-terlambat').innerText = data.terlambat || 0;
      document.getElementById('stat-sakit').innerText = data.sakit || 0;
      document.getElementById('stat-izin').innerText = data.izin || 0;
      document.getElementById('stat-alpa').innerText = data.alpa || 0;
    });

  // 2. Fetch Detail Tabel Rekap
  fetch(`${API_URL}?action=getDetailRekap`)
    .then(res => res.json())
    .then(data => {
      const tbody = document.getElementById('tabel-rekap-body');
      tbody.innerHTML = "";

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-500">Belum ada data absensi.</td></tr>`;
        return;
      }

      data.forEach(item => {
        let statusBadge = "";
        if (item.status === "Hadir") statusBadge = `<span class="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[11px] border border-emerald-500/20 font-semibold">Hadir</span>`;
        else if (item.status === "Terlambat") statusBadge = `<span class="bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded text-[11px] border border-amber-500/20 font-semibold">Terlambat</span>`;
        else if (item.status === "Sakit") statusBadge = `<span class="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-[11px] border border-blue-500/20 font-semibold">Sakit</span>`;
        else if (item.status === "Izin") statusBadge = `<span class="bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded text-[11px] border border-purple-500/20 font-semibold">Izin</span>`;
        else statusBadge = `<span class="bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded text-[11px] border border-rose-500/20 font-semibold">Alpa</span>`;

        const row = `
          <tr class="hover:bg-slate-700/30 transition">
            <td class="px-4 py-3 whitespace-nowrap">
              <div class="font-medium text-white">${item.waktu}</div>
              <div class="text-[10px] text-slate-400">${item.tanggal}</div>
            </td>
            <td class="px-4 py-3">
              <div class="font-semibold text-white">${item.nama}</div>
              <div class="text-[10px] text-slate-400">${item.nisn}</div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">${statusBadge}</td>
            <td class="px-4 py-3 text-xs text-slate-400">${item.keterangan || "-"}</td>
            <td class="px-4 py-3 text-center whitespace-nowrap space-x-1">
               <button onclick="editData(${item.rowIndex}, '${escapeJS(item.nama)}', '${escapeJS(item.status)}', '${escapeJS(item.keterangan)}')" class="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 p-1.5 rounded-lg border border-amber-500/30 text-xs">
                 ✏️ Edit
               </button>
               <button onclick="hapusData(${item.rowIndex}, '${escapeJS(item.nama)}')" class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 p-1.5 rounded-lg border border-rose-500/30 text-xs">
                 🗑️ Hapus
               </button>
            </td>
          </tr>
        `;
        tbody.innerHTML += row;
      });
    })
    .catch(err => console.error("Error load detail rekap:", err));
}

// --- FUNGSI EDIT DATA ABSEN ---
function editData(rowIndex, nama, currentStatus, currentKet) {
  const statusBaru = prompt(`Ubah Status untuk ${nama}:\n(Pilih: Hadir / Terlambat / Sakit / Izin / Alpa)`, currentStatus);
  if (!statusBaru) return;

  const ketBaru = prompt(`Masukkan Keterangan Tambahan (Opsional):`, currentKet === "-" ? "" : currentKet);

  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "editAbsen",
      rowIndex: rowIndex,
      status: statusBaru,
      keterangan: ketBaru
    })
  })
  .then(res => res.json())
  .then(res => {
    alert(res.message);
    loadDashboardData(); // Reload tabel otomatis
  });
}

// --- FUNGSI HAPUS DATA ABSEN ---
function hapusData(rowIndex, nama) {
  if (confirm(`Apakah kamu yakin ingin menghapus data absensi ${nama}?`)) {
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "hapusAbsen",
        rowIndex: rowIndex
      })
    })
    .then(res => res.json())
    .then(res => {
      alert(res.message);
      loadDashboardData(); // Reload tabel otomatis
    });
  }
}

function logout() {
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("sessionToken");
  localStorage.removeItem("adminUser");
  window.location.replace("login.html");
}

function escapeJS(str) {
  return String(str || '').replace(/'/g, "\\'");
}