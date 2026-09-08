// ==========================================
// 1. WEB HOOK ENGINE (GET & POST)
// ==========================================

function doGet(e) {
  var action = e.parameter.action;

  if (action === "getRekap") {
    return responseJSON(getRekapData());
  } else if (action === "getDetailRekap") {
    return responseJSON(getDetailRekapData());
  } else if (action === "getSiswaRekap") {
    return responseJSON(getSiswaPeriodikData(e.parameter.nisn));
  } else if (action === "getGlobalRekap") {
    return responseJSON(getGlobalPeriodikData());
  } else if (action === "getAllSiswa") {
    return responseJSON(getMasterSiswaData());
  } else if (action === "getWeeklyTrend") {
    return responseJSON(getWeeklyTrendData());
  } else if (action === "getAverageArrival") {
    return responseJSON(getAverageArrivalTime());
  } else if (action === "exportRekapCSV") {
    var pilihBulan = e.parameter.bulan || "all";
    return exportRekapCSV(pilihBulan);
  }

  return responseJSON({ status: "success", message: "API Absensi Ready!" });
}

// --- FUNGSI EXPORT CSV (UPDATE: SUPPORT DYNAMIC MONTH SHEETS) ---
function exportRekapCSV(pilihBulan) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet;
  var namaFile;

  if (pilihBulan === "all" || !pilihBulan) {
    // Export sheet Rekap_Bulanan (total keseluruhan) sebagai fallback
    sheet = ss.getSheetByName("Rekap_Bulanan");
    if (!sheet) {
      return ContentService.createTextOutput("Error: Sheet Rekap_Bulanan tidak ditemukan!").setMimeType(ContentService.MimeType.TEXT);
    }
    namaFile = "Rekap_Bulanan_X_PPLG.csv";
  } else {
    // Cari sheet berdasarkan nama bulan (misal: "Agustus", "September")
    var monthName = getSheetNameByMonthNumber(pilihBulan);
    if (!monthName) {
      return ContentService.createTextOutput("Error: Bulan tidak valid!").setMimeType(ContentService.MimeType.TEXT);
    }
    sheet = findSheetByMonthName(monthName);
    if (!sheet) {
      return ContentService.createTextOutput("Error: Sheet untuk bulan " + monthName + " tidak ditemukan! Silakan jalankan generateNewSheets() terlebih dahulu.").setMimeType(ContentService.MimeType.TEXT);
    }
    namaFile = "Rekap_" + monthName + ".csv";
  }

  var data = sheet.getDataRange().getValues();
  var csvString = "";

  for (var j = 0; j < data.length; j++) {
    var csvRow = data[j].map(function(cell) {
      return '"' + String(cell).replace(/"/g, '""') + '"';
    });
    csvString += csvRow.join(",") + "\r\n";
  }

  return ContentService.createTextOutput(csvString)
    .setMimeType(ContentService.MimeType.CSV)
    .downloadAsFile(namaFile);
}


function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var action = contents.action;

    // --- SMART LOGIN (ADMIN & SISWA) ---
    if (action === "login") {
      var user = String(contents.username).trim();
      var pass = String(contents.password).trim();

      var ADMIN_USER = "fanka";
      var ADMIN_PASS = "fanka123";

      if (user === ADMIN_USER && pass === ADMIN_PASS) {
        return responseJSON({
          status: "success",
          role: "admin",
          token: "ADM_SESSION_" + Utilities.getUuid(),
          nama: "Administrator"
        });
      }

      var siswaData = valSiswaLogin(user, pass);
      if (siswaData.valid) {
        return responseJSON({
          status: "success",
          role: "siswa",
          token: "SISWA_SESSION_" + Utilities.getUuid(),
          nisn: siswaData.nisn,
          nama: siswaData.nama
        });
      }

      return responseJSON({ status: "error", message: "NISN / Username atau Password salah!" });
    }

    // --- SCAN QR (KAMERA) ---
    if (action === "scanQR") {
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000); 
      } catch (lockErr) {
        return responseJSON({ status: "error", message: "Server lagi sibuk, coba scan ulang beberapa detik lagi." });
      }

      try {
        var now = new Date();

        if (isHariLibur(now)) {
          return responseJSON({ status: "error", message: "Absensi libur pada hari Sabtu & Minggu!" });
        }

        var qrRaw = String(contents.qrData).trim();
        var nisn = qrRaw.includes(",") ? qrRaw.split(",")[0].trim() : qrRaw;
        var nama = qrRaw.includes(",") ? qrRaw.split(",")[1].trim() : cariNamaByNISN(nisn);

        var cekKuota = cekKuotaAbsenHariIni(nisn, now);
        if (cekKuota.error) {
          return responseJSON({ status: "error", message: cekKuota.message });
        }

        // Format tanggal hari ini otomatis untuk scan QR (YYYY-MM-DD)
        var tglHariIni = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
        var res = simpanAbsenCustomDate(nisn, nama, "Hadir", "", tglHariIni);
        return responseJSON({ status: "success", message: res, nisn: nisn, nama: nama });
      } finally {
        lock.releaseLock();
      }
    }

    // --- EDIT DATA ABSEN (ADMIN) ---
    if (action === "editAbsen") {
      var resEdit = editAbsenSiswa(contents.rowIndex, contents.status, contents.keterangan);
      return responseJSON({ status: "success", message: resEdit });
    }

    // --- HAPUS DATA ABSEN (ADMIN) ---
    if (action === "hapusAbsen") {
      var resHapus = hapusAbsenSiswa(contents.rowIndex);
      return responseJSON({ status: "success", message: resHapus });
    }

    // --- AUTO ALPA (ADMIN) ---
    if (action === "generateAlpa") {
      var resAlpa = generateAlpaHariIni();
      return responseJSON({ status: "success", message: resAlpa });
    }

    // --- BERSIHKAN DATA DUPLIKAT (ADMIN) ---
    if (action === "bersihkanDuplikat") {
      var resBersih = bersihkanDataDuplikat();
      return responseJSON({ status: "success", message: resBersih });
    }

    // --- MANAJEMEN SISWA (TAMBAH SISWA) ---
    if (action === "tambahSiswa") {
      var resTambah = tambahSiswa(contents.nisn, contents.nama, contents.password);
      return responseJSON({ status: "success", message: resTambah });
    }

    // --- INPUT ABSEN / SAKIT / IZIN MANUAL (DENGAN TANGGAL PILIHAN ADMIN) ---
    if (action === "absenManual") {
      var tglManual = contents.tanggal; // Mengambil tanggal dari inputan user di web
      var resManual = simpanAbsenCustomDate(contents.nisn, contents.nama, contents.status, contents.keterangan, tglManual);
      return responseJSON({ status: "success", message: resManual });
    }

    // --- PENGAJUAN IZIN / SAKIT MANDIRI (SISWA) ---
    if (action === "ajukanIzinSiswa") {
      var nisn = contents.nisn;
      var nama = cariNamaByNISN(nisn);
      var statusInput = contents.status; 
      var keterangan = contents.keterangan ? contents.keterangan : "Pengajuan mandiri siswa";
      
      var tglHariIni = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
      var resIzin = simpanAbsenCustomDate(nisn, nama, statusInput, keterangan, tglHariIni);
      return responseJSON({ status: "success", message: "Berhasil mengajukan " + statusInput });
    }

    return responseJSON({ status: "error", message: "Action tidak dikenal" });

  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  }
}

// --- FUNGSI BANTUAN PENYIMPANAN DATA DENGAN TANGGAL CUSTOM (MENYELESAIKAN MASALAH 1) ---
function simpanAbsenCustomDate(nisn, nama, status, keterangan, tanggalCustom) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Rekap_Absensi");
  
  if (!sheet) {
    throw new Error("Sheet Rekap_Absensi tidak ditemukan!");
  }

  var waktuInput = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");

  // Masukkan baris baru ke sheet Rekap_Absensi menggunakan tanggal yang dipilih
  sheet.appendRow([
    tanggalCustom, 
    waktuInput, 
    String(nisn), 
    nama, 
    status, 
    keterangan || ""
  ]);

  return "Data absensi berhasil disimpan untuk tanggal " + tanggalCustom;
}

// Helper untuk merespon JSON
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
// ==========================================
// 2. LOGIKA AUTENTIKASI & REKAP PERIODIK
// ==========================================

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Validasi Login Siswa
function valSiswaLogin(nisnInput, passInput) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Data_Siswa");
  if (!sheet) return { valid: false };

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var nisn = String(data[i][0]).trim();
    var nama = data[i][1];
    // Password default menggunakan NISN jika tidak ada kolom password khusus
    var password = data[i][2] ? String(data[i][2]).trim() : nisn;

    if (nisn === nisnInput && (passInput === password || passInput === nisn)) {
      return { valid: true, nisn: nisn, nama: nama };
    }
  }
  return { valid: false };
}

function cariNamaByNISN(nisn) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Data_Siswa");
  if (!sheet) return "Siswa Tidak Dikenal";
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(nisn).trim()) return data[i][1];
  }
  return "Siswa Tidak Dikenal";
}

// ==========================================
// 2b. VALIDASI TAMBAHAN (digabung dari processScan())
// ==========================================

// Cek apakah hari ini Sabtu/Minggu (hari libur absensi)
function isHariLibur(now) {
  var dayOfWeek = now.getDay(); // Minggu = 0, Sabtu = 6
  return (dayOfWeek === 0 || dayOfWeek === 6);
}

// Cek double-scan hari ini & kuota maksimal siswa per hari
function cekKuotaAbsenHariIni(nisn, now) {
  var MAX_SISWA_PER_HARI = 35;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rekap_Absensi");
  var timeZone = Session.getScriptTimeZone();
  var todayStr = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");

  var data = sheet.getDataRange().getValues();
  var countToday = 0;

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue; // lewati baris kosong

    // Kolom A = tanggal, kolom C = NISN (sesuai skema simpanAbsen)
    var rowDate = (data[i][0] instanceof Date)
      ? Utilities.formatDate(data[i][0], timeZone, "yyyy-MM-dd")
      : String(data[i][0]);

    if (rowDate === todayStr) {
      countToday++;
      var rowNisn = String(data[i][2]).trim();
      if (rowNisn === String(nisn).trim()) {
        return { error: true, message: "Kamu sudah melakukan absensi hari ini!" };
      }
    }
  }

  if (countToday >= MAX_SISWA_PER_HARI) {
    return { error: true, message: "Kuota absensi hari ini sudah penuh (Maksimal " + MAX_SISWA_PER_HARI + " Siswa)!" };
  }

  return { error: false };
}

// Hapus data yang double (NISN sama + tanggal sama) — data pertama yang dipertahankan, sisanya dihapus.
// Dipanggil manual oleh admin (action: "bersihkanDuplikat") buat jaga-jaga kalau ada data nyempil dobel.
function bersihkanDataDuplikat() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rekap_Absensi");
  var data = sheet.getDataRange().getValues();
  var timeZone = Session.getScriptTimeZone();
  var seen = {};
  var rowsToDelete = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var tglStr = (data[i][0] instanceof Date)
      ? Utilities.formatDate(data[i][0], timeZone, "yyyy-MM-dd")
      : String(data[i][0]);
    var nisn = String(data[i][2]).trim();
    var key = tglStr + "|" + nisn;

    if (seen[key]) {
      rowsToDelete.push(i + 1); // baris ke-2 dst dengan key sama = duplikat
    } else {
      seen[key] = true;
    }
  }

  // Hapus dari bawah ke atas biar nomor baris yang belum dihapus ga geser
  rowsToDelete.sort(function (a, b) { return b - a; });
  for (var j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j]);
  }

  return "Berhasil menghapus " + rowsToDelete.length + " data duplikat.";
}

// SIMPAN ABSEN
function simpanAbsen(nisn, nama, statusInput, keteranganInput) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rekap_Absensi");
  var now = new Date();
  var timeZone = Session.getScriptTimeZone();
  var tanggal = Utilities.formatDate(now, timeZone, "yyyy-MM-dd"); // Format standar yyyy-MM-dd
  var waktuScan = Utilities.formatDate(now, timeZone, "HH:mm:ss");

  var status = statusInput;
  var keterlambatan = "-";
  var keterangan = keteranganInput ? keteranganInput : "-";

  if (statusInput === "Hadir") {
    var batasWaktu = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 25, 0);
    if (now > batasWaktu) {
      status = "Terlambat";
      var selisihMenit = Math.floor((now - batasWaktu) / 1000 / 60);
      keterlambatan = (selisihMenit === 0 ? 1 : selisihMenit) + " Menit";
    }
  }
  sheet.appendRow([tanggal, waktuScan, nisn, nama, status, keterlambatan, keterangan]);
  return "Berhasil absen: " + nama + " (" + status + ")";
}

// CALCULATE STATISTIK SISWA (PERMINGGU, PERBULAN, PERTAHUN)
function getSiswaPeriodikData(searchNisn) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rekap_Absensi");
  if (!sheet) return { mingguan: {}, bulanan: {}, tahunan: {}, riwayat: [] };

  var data = sheet.getDataRange().getValues();
  var now = new Date();

  // Hitung rentang waktu
  var oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();

  function createStatsObj() {
    return { total: 0, hadir: 0, terlambat: 0, sakit: 0, izin: 0, alpa: 0, persentase: 0 };
  }

  var statsMinggu = createStatsObj();
  var statsBulan = createStatsObj();
  var statsTahun = createStatsObj();
  var riwayat = [];

  for (var i = 1; i < data.length; i++) {
    var nisnInSheet = String(data[i][2]).trim();
    if (nisnInSheet !== String(searchNisn).trim()) continue;

    var rawDate = new Date(data[i][0]);
    var status = data[i][4];

    var item = {
      tanggal: Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "dd/MM/yyyy"),
      waktu: data[i][1],
      status: status,
      keterangan: data[i][6]
    };
    riwayat.push(item);

    // 1. Kalkulasi Tahunan
    if (rawDate.getFullYear() === currentYear) {
      addStat(statsTahun, status);

      // 2. Kalkulasi Bulanan
      if (rawDate.getMonth() === currentMonth) {
        addStat(statsBulan, status);
      }

      // 3. Kalkulasi Mingguan (7 Hari Terakhir)
      if (rawDate >= oneWeekAgo) {
        addStat(statsMinggu, status);
      }
    }
  }

  // Hitung Persentase Kehadiran
  calcPercent(statsMinggu);
  calcPercent(statsBulan);
  calcPercent(statsTahun);

  return {
    mingguan: statsMinggu,
    bulanan: statsBulan,
    tahunan: statsTahun,
    riwayat: riwayat.reverse()
  };
}

function addStat(obj, status) {
  obj.total++;
  if (status === "Hadir") obj.hadir++;
  else if (status === "Terlambat") obj.terlambat++;
  else if (status === "Sakit") obj.sakit++;
  else if (status === "Izin") obj.izin++;
  else if (status === "Alpa") obj.alpa++;
}

function calcPercent(obj) {
  if (obj.total === 0) {
    obj.persentase = 0;
  } else {
    // Yang membuat persentase 100% HANYA status "Hadir" yang tepat waktu
    // Terlambat, Sakit, Izin, dan Alpa akan mengurangi persentase
    var totalHadirMurni = obj.hadir;
    
    obj.persentase = Math.round((totalHadirMurni / obj.total) * 100);
  }
}

// REKAP GENERAL ADMIN
function getRekapData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rekap_Absensi");
  var data = sheet.getDataRange().getValues();
  var stats = { total: 0, hadir: 0, terlambat: 0, sakit: 0, izin: 0, alpa: 0 };
  for (var i = 1; i < data.length; i++) {
    var status = data[i][4];
    if (!status) continue;
    stats.total++;
    if (status === "Hadir") stats.hadir++;
    else if (status === "Terlambat") stats.terlambat++;
    else if (status === "Sakit") stats.sakit++;
    else if (status === "Izin") stats.izin++;
    else if (status === "Alpa") stats.alpa++;
  }
  return stats;
}

function getDetailRekapData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rekap_Absensi");
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var list = [];
  var timeZone = Session.getScriptTimeZone();

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var tglStr = (data[i][0] instanceof Date) ? Utilities.formatDate(data[i][0], timeZone, "dd/MM/yyyy") : data[i][0];
    list.push({
      rowIndex: i + 1, tanggal: tglStr, waktu: data[i][1],
      nisn: String(data[i][2]), nama: data[i][3], status: data[i][4],
      keterlambatan: data[i][5], keterangan: data[i][6]
    });
  }
  return list.reverse();
}

function generateAlpaHariIni() {
  var now = new Date();
  if (isHariLibur(now)) {
    return "Hari ini Sabtu/Minggu (libur), tidak ada Alpa yang di-generate.";
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetSiswa = ss.getSheetByName("Data_Siswa");
  var sheetRekap = ss.getSheetByName("Rekap_Absensi");

  var dataSiswa = sheetSiswa.getDataRange().getValues();
  var dataRekap = sheetRekap.getDataRange().getValues();
  var timeZone = Session.getScriptTimeZone();
  var hariIni = Utilities.formatDate(now, timeZone, "yyyy-MM-dd");

  var nisnSudahAbsen = [];
  for (var i = 1; i < dataRekap.length; i++) {
    var tglStr = (dataRekap[i][0] instanceof Date) ? Utilities.formatDate(dataRekap[i][0], timeZone, "yyyy-MM-dd") : dataRekap[i][0];
    if (tglStr === hariIni) {
      nisnSudahAbsen.push(String(dataRekap[i][2]).trim());
    }
  }

  var countAlpa = 0;
  for (var j = 1; j < dataSiswa.length; j++) {
    var nisnMaster = String(dataSiswa[j][0]).trim();
    var namaMaster = dataSiswa[j][1];

    if (!nisnMaster) continue;
    if (nisnSudahAbsen.indexOf(nisnMaster) === -1) {
      sheetRekap.appendRow([hariIni, "00:00:00", nisnMaster, namaMaster, "Alpa", "-", "Tanpa Keterangan (Auto-Alpa)"]);
      countAlpa++;
    }
  }
  return "Berhasil set " + countAlpa + " siswa sebagai ALPA hari ini.";
}

function editAbsenSiswa(rowIndex, statusBaru, ketBaru) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rekap_Absensi");
  sheet.getRange(rowIndex, 5).setValue(statusBaru);
  sheet.getRange(rowIndex, 7).setValue(ketBaru ? ketBaru : "-");
  return "Data berhasil diperbarui!";
}

function hapusAbsenSiswa(rowIndex) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rekap_Absensi");
  sheet.deleteRow(rowIndex);
  return "Data berhasil dihapus!";
}

// KALKULASI REKAP PERIODIK GLOBAL (UNTUK INDEX.HTML)
function getGlobalPeriodikData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Rekap_Absensi");
  if (!sheet) return { mingguan: {}, bulanan: {}, tahunan: {} };

  var data = sheet.getDataRange().getValues();
  var now = new Date();

  var oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();

  function createStatsObj() {
    return { total: 0, hadir: 0, terlambat: 0, sakit: 0, izin: 0, alpa: 0, persentase: 0 };
  }

  var statsMinggu = createStatsObj();
  var statsBulan = createStatsObj();
  var statsTahun = createStatsObj();

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var rawDate = new Date(data[i][0]);
    var status = data[i][4];

    // 1. Kalkulasi Tahunan
    if (rawDate.getFullYear() === currentYear) {
      addStat(statsTahun, status);

      // 2. Kalkulasi Bulanan
      if (rawDate.getMonth() === currentMonth) {
        addStat(statsBulan, status);
      }

      // 3. Kalkulasi Mingguan (7 Hari Terakhir)
      if (rawDate >= oneWeekAgo) {
        addStat(statsMinggu, status);
      }
    }
  }

   calcPercent(statsMinggu);
   calcPercent(statsBulan);
   calcPercent(statsTahun);

   var hariIni = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
   var todayCount = 0;
   for (var i = 1; i < data.length; i++) {
     if (!data[i][0]) continue;
     var rowDate = (data[i][0] instanceof Date)
       ? Utilities.formatDate(data[i][0], Session.getScriptTimeZone(), "yyyy-MM-dd")
       : String(data[i][0]);
     if (rowDate === hariIni) {
       var rowStatus = data[i][4];
       if (rowStatus === "Hadir" || rowStatus === "Terlambat") todayCount++;
     }
   }

   var totalSiswa = 0;
   var sheetSiswa = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Data_Siswa");
   if (sheetSiswa) {
     totalSiswa = sheetSiswa.getDataRange().getLastRow() - 1;
     if (totalSiswa < 0) totalSiswa = 0;
   }
   var persentaseHariIni = totalSiswa > 0 ? Math.round((todayCount / totalSiswa) * 100) : 0;

    return {
      mingguan: statsMinggu,
      bulanan: statsBulan,
      tahunan: statsTahun,
      persentase: persentaseHariIni,
      totalSiswa: totalSiswa
    };
}

// RATA-RATA WAKTU KEDATANGAN HARI INI
function getAverageArrivalTime() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Rekap_Absensi");
  if (!sheet) return { averageTime: "-" };

  var data = sheet.getDataRange().getValues();
  var timeZone = Session.getScriptTimeZone();
  var hariIni = Utilities.formatDate(new Date(), timeZone, "yyyy-MM-dd");

  var totalMinutes = 0;
  var count = 0;

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;

    var rowDate = (data[i][0] instanceof Date)
      ? Utilities.formatDate(data[i][0], timeZone, "yyyy-MM-dd")
      : String(data[i][0]);

    if (rowDate === hariIni) {
      var status = data[i][4];
      if (status === "Hadir" || status === "Terlambat") {
        var timeStr = String(data[i][1] || "");
        var parts = timeStr.split(":");
        if (parts.length >= 2) {
          var jam = parseInt(parts[0], 10) || 0;
          var menit = parseInt(parts[1], 10) || 0;
          totalMinutes += jam * 60 + menit;
          count++;
        }
      }
    }
  }

  if (count === 0) return { averageTime: "-" };

  var avgMinutes = Math.round(totalMinutes / count);
  var avgJam = Math.floor(avgMinutes / 60);
  var avgMenit = avgMinutes % 60;
  var formatted = ("0" + avgJam).slice(-2) + ":" + ("0" + avgMenit).slice(-2);

  return { averageTime: formatted };
}

// TREND MINGGUAN — 5 HARI KERJA (SEN–JUM)
function getWeeklyTrendData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetAbsensi = ss.getSheetByName("Rekap_Absensi");
  if (!sheetAbsensi) return { daily: [], trend: "+0.0%", trendValue: 0 };

  var data = sheetAbsensi.getDataRange().getValues();
  var timeZone = Session.getScriptTimeZone();
  var now = new Date();

  var sheetSiswa = ss.getSheetByName("Data_Siswa");
  var totalSiswa = 0;
  if (sheetSiswa) {
    totalSiswa = sheetSiswa.getDataRange().getLastRow() - 1;
    if (totalSiswa < 0) totalSiswa = 0;
  }

  var dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  var workingDays = [1, 2, 3, 4, 5];

  function getWeekdayDates() {
    var date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var day = date.getDay();

    var thisWeek = [];
    var lastWeek = [];

    workingDays.forEach(function (d) {
      var currentDay = new Date(date);
      currentDay.setDate(currentDay.getDate() - ((day - d + 7) % 7));
      thisWeek.push(new Date(currentDay));

      var prevDay = new Date(currentDay);
      prevDay.setDate(prevDay.getDate() - 7);
      lastWeek.push(new Date(prevDay));
    });

    return { thisWeek: thisWeek, lastWeek: lastWeek };
  }

  function calcWeekAvg(dates) {
    var totalPct = 0;
    var validDays = 0;

    dates.forEach(function (d) {
      var dateStr = Utilities.formatDate(d, timeZone, "yyyy-MM-dd");
      var present = 0;

      for (var i = 1; i < data.length; i++) {
        if (!data[i][0]) continue;

        var rowDate = (data[i][0] instanceof Date)
          ? Utilities.formatDate(data[i][0], timeZone, "yyyy-MM-dd")
          : String(data[i][0]);

        if (rowDate === dateStr) {
          var status = data[i][4];
          if (status === "Hadir" || status === "Terlambat") present++;
        }
      }

      var pct = totalSiswa > 0 ? Math.round((present / totalSiswa) * 100) : 0;
      totalPct += pct;
      validDays++;
    });

    return validDays > 0 ? totalPct / validDays : 0;
  }

  var weekDates = getWeekdayDates();

  var daily = weekDates.thisWeek.map(function (d) {
    var dateStr = Utilities.formatDate(d, timeZone, "yyyy-MM-dd");
    var present = 0;

    for (var i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;

      var rowDate = (data[i][0] instanceof Date)
        ? Utilities.formatDate(data[i][0], timeZone, "yyyy-MM-dd")
        : String(data[i][0]);

      if (rowDate === dateStr) {
        var status = data[i][4];
        if (status === "Hadir" || status === "Terlambat") present++;
      }
    }

    var pct = totalSiswa > 0 ? Math.round((present / totalSiswa) * 100) : 0;
    var dayName = dayLabels[d.getDay()];

    return { label: dayName, percentage: pct };
  });

  var thisWeekAvg = calcWeekAvg(weekDates.thisWeek);
  var lastWeekAvg = calcWeekAvg(weekDates.lastWeek);

  var trendValue = 0;
  if (lastWeekAvg > 0) {
    trendValue = thisWeekAvg - lastWeekAvg;
  }

  var trendStr = trendValue >= 0
    ? "+" + trendValue.toFixed(1) + "%"
    : trendValue.toFixed(1) + "%";

  return {
    daily: daily,
    trend: trendStr,
    trendValue: trendValue,
    totalSiswa: totalSiswa
  };
}

// ==========================================
// HELPER: NAMA BULAN & SHEET MANAGEMENT
// ==========================================
var NAMA_BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                      "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function getNamaBulanByIndex(idx) {
  return NAMA_BULAN_ID[idx];
}

function getCurrentMonthSheetName() {
  var now = new Date();
  return getNamaBulanByIndex(now.getMonth()) + " " + now.getFullYear();
}

function getSheetNameByMonthNumber(bulanNum) {
  var idx = parseInt(bulanNum, 10) - 1;
  if (idx < 0 || idx > 11) return null;
  return getNamaBulanByIndex(idx);
}

function findSheetByMonthName(monthName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sheetName = sheets[i].getName();
    if (sheetName.indexOf(monthName) === 0) {
      return sheets[i];
    }
  }
  return null;
}

function getWorkingDaysInMonth(year, month) {
  var days = [];
  var date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      days.push(new Date(date));
    }
    date.setDate(date.getDate() + 1);
  }
  return days;
}

// GENERATE SHEET BARU SESUAI BULAN — FORMAT SAMA DENGAN Rekap_Bulanan
function generateNewSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var timeZone = Session.getScriptTimeZone();
  var now = new Date();
  var sheetName = getCurrentMonthSheetName();

  // Hapus sheet yang sama jika sudah ada
  var existingSheet = ss.getSheetByName(sheetName);
  if (existingSheet) {
    ss.deleteSheet(existingSheet);
  }

  // Buat sheet baru
  var sheet = ss.insertSheet(sheetName);

  // Ambil data siswa dari Data_Siswa
  var sheetSiswa = ss.getSheetByName("Data_Siswa");
  var siswaList = [];
  if (sheetSiswa) {
    var siswaData = sheetSiswa.getDataRange().getValues();
    for (var i = 1; i < siswaData.length; i++) {
      var nisn = String(siswaData[i][0] || "").trim();
      var nama = String(siswaData[i][1] || "").trim();
      if (nisn && nama) {
        siswaList.push([nisn, nama]);
      }
    }
  }

  // Hitung hari kerja (Sen-Jum) di bulan ini
  var workingDays = getWorkingDaysInMonth(now.getFullYear(), now.getMonth());
  var totalCols = workingDays.length + 2; // +2 untuk NISN dan Nama

  // Row 1: Judul
  sheet.getRange(1, 1, 1, totalCols).merge();
  sheet.getRange("A1").setValue("Rekap Absensi Bulanan X PPLG");
  sheet.getRange("A1").setFontWeight("bold").setFontSize(14).setHorizontalAlignment("center");

  // Row 2: Sub-judul
  sheet.getRange(2, 1, 1, totalCols).merge();
  sheet.getRange("A2").setValue("Bulan " + sheetName);
  sheet.getRange("A2").setFontStyle("italic").setHorizontalAlignment("center");

  // Row 3: Header kolom
  sheet.getRange("A3").setValue("NISN");
  sheet.getRange("B3").setValue("Nama");
  sheet.getRange(3, 1, 1, 2).setFontWeight("bold");

  // Header tanggal (kolom C ke tiap hari kerja)
  for (var i = 0; i < workingDays.length; i++) {
    var dateStr = Utilities.formatDate(workingDays[i], timeZone, "dd/MM");
    sheet.getRange(3, i + 3).setValue(dateStr);
  }
  sheet.getRange(3, 3, 1, workingDays.length).setFontWeight("bold").setHorizontalAlignment("center");

  // Freeze row 3
  sheet.setFrozenRows(3);

  // Isi data siswa
  for (var i = 0; i < siswaList.length; i++) {
    sheet.getRange(i + 4, 1).setValue(siswaList[i][0]);
    sheet.getRange(i + 4, 2).setValue(siswaList[i][1]);
  }

  // Lebar kolom
  sheet.setColumnWidth(1, 120); // NISN
  sheet.setColumnWidth(2, 200); // Nama
  for (var j = 0; j < workingDays.length; j++) {
    sheet.setColumnWidth(j + 3, 60);
  }

  // Alignment untuk area data
  var lastCol = totalCols;
  var maxRow = Math.max(siswaList.length + 4, sheet.getMaxRows());
  if (maxRow > 3) {
    sheet.getRange(4, 1, maxRow - 3, lastCol).setVerticalAlignment("middle").setHorizontalAlignment("center");
    sheet.getRange(4, 2, maxRow - 3, 1).setHorizontalAlignment("left");
  }

  // Set text wrap untuk kolom tanggal
  if (workingDays.length > 0) {
    sheet.getRange(3, 3, 1, workingDays.length).setWrap(true);
  }

  return sheetName + " berhasil dibuat. " + siswaList.length + " siswa, " + workingDays.length + " hari kerja.";
}

function generateQRToDrive() {
  var folderName = "QR_Code_Siswa_Senexus";
  var folders = DriveApp.getFoldersByName(folderName);
  var folder;

  // Cek apakah folder sudah ada, jika belum buat folder baru di Google Drive
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }

  // Ambil data dari sheet Data_Siswa
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Data_Siswa");
  var data = sheet.getDataRange().getValues();

  // Loop mulai baris ke-2 (mengabaikan header)
  for (var i = 1; i < data.length; i++) {
    var nisn = data[i][0]; // Kolom A: NISN
    var nama = data[i][1]; // Kolom B: Nama

    if (!nisn || !nama) continue;

    // Buat payload text (contoh: 115189341,RAIFAL ADITIA NUGRAHA)
    var payload = encodeURIComponent(nisn + "," + nama);
    var qrUrl = "https://quickchart.io/qr?size=300&text=" + payload;

    // Fetch gambar dari QuickChart
    var response = UrlFetchApp.fetch(qrUrl);
    var blob = response.getBlob().setName(nisn + "_" + nama.toString().replace(/[^a-zA-Z0-9]/g, "_") + ".png");

    // Simpan file ke folder Google Drive
    folder.createFile(blob);
  }

  Logger.log("Selesai! Folder '" + folderName + "' berisi seluruh QR Code telah dibuat di Drive.");
}
function getMasterSiswaData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Data_Siswa");
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var list = [];
  
  // Baris 0 adalah Header (NISN, NAMA LENGKAP)
  for (var i = 1; i < data.length; i++) {
    var nisn = String(data[i][0]).trim();
    var nama = String(data[i][1]).trim();
    
    if (nisn && nama) {
      list.push({
        nisn: nisn,
        nama: nama
      });
    }
  }
  return list;
}

function sinkronkanRekapPintar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetAbsensi = ss.getSheetByName("Rekap_Absensi");
  var sheetRekap = ss.getSheetByName(getCurrentMonthSheetName());
  var timeZone = Session.getScriptTimeZone();
  var now = new Date();
  
  if (!sheetAbsensi || !sheetRekap) {
    return "Sheet 'Rekap_Absensi' atau '" + getCurrentMonthSheetName() + "' tidak ditemukan!";
  }
  
  var dataAbsensi = sheetAbsensi.getDataRange().getValues();
  var dataRekap = sheetRekap.getDataRange().getValues();
  
  var targetMonth = now.getMonth();
  var targetYear = now.getFullYear();
  
  var workingDays = getWorkingDaysInMonth(targetYear, targetMonth);

  var kolList = [];
  var dateToCol = {};

  for (var i = 0; i < workingDays.length; i++) {
    kolList.push(i + 3);
    dateToCol[Utilities.formatDate(workingDays[i], timeZone, "yyyy-MM-dd")] = i + 3;
  }

  var maxCol = workingDays.length > 0 ? kolList[kolList.length - 1] : 3;
  
  // Kosongkan dulu kotak rekap (baris ke-4 ke bawah, kolom C sampai V)
  for (var r = 3; r < dataRekap.length; r++) {
    for (var c = 3; c <= maxCol; c++) {
      sheetRekap.getRange(r + 1, c).setValue("");
    }
  }
  
  function bersihkanTeks(str) {
    return String(str || "").toUpperCase().replace(/\s+/g, " ").trim();
  }
  
  for (var logIdx = 1; logIdx < dataAbsensi.length; logIdx++) {
    var rawTgl = dataAbsensi[logIdx][0];     
    var rawNisn = bersihkanTeks(dataAbsensi[logIdx][2]); // Kolom C: NISN
    var rawNama = bersihkanTeks(dataAbsensi[logIdx][3]); // Kolom D: Nama Siswa
    var rawStatus = bersihkanTeks(dataAbsensi[logIdx][4]); // Kolom E: Status Kehadiran
    
    if (!rawTgl) continue;
    
    var tglLogObj = new Date(rawTgl);
    if (tglLogObj.getMonth() !== targetMonth) continue;
    if (tglLogObj.getFullYear() !== targetYear) continue;
    
    var logTglStr = Utilities.formatDate(tglLogObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
    
    // PEMETAAN HURUF YANG AKURAT (Jangan gabungkan Terlambat ke Hadir)
    var huruf = "-";
    if (rawStatus.includes("TERLAMBAT")) huruf = "T";
    else if (rawStatus.includes("HADIR")) huruf = "H";
    else if (rawStatus.includes("SAKIT")) huruf = "S";
    else if (rawStatus.includes("IZIN")) huruf = "I";
    else if (rawStatus.includes("ALPA")) huruf = "A";
    
    var targetCol = dateToCol[logTglStr];
    
    // CARI BARIS SISWA: UTAMAKAN NISN AGAR TIDAK SALAH ORANG
    var targetRow = -1;
    for (var r = 3; r < dataRekap.length; r++) {
      var nisnDiSheet = bersihkanTeks(dataRekap[r][0]); // Asumsi kolom A sheet rekap adalah NISN
      var namaDiSheet = bersihkanTeks(dataRekap[r][1]); // Asumsi kolom B adalah Nama
      
      if (rawNisn !== "" && nisnDiSheet === rawNisn) {
        targetRow = r + 1;
        break;
      }
    }
    
    // Kalau lewat NISN tidak ketemu, fallback pencocokan ke Nama
    if (targetRow === -1) {
      for (var r = 3; r < dataRekap.length; r++) {
        var namaDiSheet = bersihkanTeks(dataRekap[r][1]);
        if (namaDiSheet === rawNama) {
          targetRow = r + 1;
          break;
        }
      }
    }
    
    if (targetRow !== -1 && targetCol !== undefined && huruf !== "-") {
      sheetRekap.getRange(targetRow, targetCol).setValue(huruf);
    }
  }
  
  return "Sinkronisasi rekap berhasil dan akurat! " + workingDays.length + " hari kerja diproses.";
}