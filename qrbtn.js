
// ===== Helpers để rút gọn =====
function stripSpaces(s){ return String(s||"").replace(/\s+/g, " ").trim(); }

// Rút gọn danh xưng công ty phổ biến (tuỳ nhu cầu, có thể mở rộng)
function abbreviateOrgName(s){
  return String(s||"")
    .replace(/Công ty Trách nhiệm Hữu hạn/gi, "CTY TNHH")
    .replace(/Công ty cổ phần/gi, "CTCP")
    .replace(/Trách nhiệm hữu hạn/gi, "TNHH")
    .replace(/Công ty/gi, "CTY")
    .trim();
}

// Cắt bớt địa chỉ quá dài (ví dụ 120 ký tự)
function shortenAddr(s, max=120){
  s = stripSpaces(s);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Bỏ dấu tiếng Việt khi bắt buộc (fallback)
function removeDiacritics(s){
  return String(s||"")
    .normalize("NFD").replace(/\p{Diacritic}/gu, ""); // yêu cầu trình duyệt modern
}

// ===== Payload builders (giữ cấu trúc của bạn, thêm rút gọn) =====
function mecardEscape(s){ return String(s||"").replace(/([\\;:,])/g, "\\$1"); }
// function vcardEscape(s){ return String(s||"").replace(/[\\n,;]/g, m => ({'\n':'\\n', ',':'\\,',';':'\\;'}[m])); }

function buildMECARD(d, opts={}) {
  const name = stripSpaces(d.name);
  const addr = shortenAddr(d.addr);
  const email = stripSpaces(d.email);
  const phone = stripSpaces(d.phone);
  const tax  = stripSpaces(d.taxId);

  let payload = [
    "MECARD:",
    name  ? `N:${mecardEscape(name)};`   : "",
    phone ? `TEL:${mecardEscape(phone)};`: "",
    email ? `EMAIL:${mecardEscape(email)};`: "",
    addr  ? `ADR:${mecardEscape(addr)};`  : "",
    tax   ? `NOTE:MST ${mecardEscape(tax)};` : ""
  ].join("") + ";";

  if (opts.asciiOnly) payload = removeDiacritics(payload);
  return payload;
}

// Escapes per vCard 3.0: \ , ; and actual newlines
function vcardEscape(s) {
  return String(s || "")
    .replace(/([\\,\n;])/g, m => (
      m === "\\" ? "\\\\" :
      m === "\n" ? "\\n"  :
      m === ","  ? "\\,"  :
                   "\\;"
    ));
}

// RFC 2426/2425: lines must be <= 75 octets; soft-wrap with CRLF + space
function foldVCardPayload(payload) {
  const enc = new TextEncoder();
  const CRLF = "\r\n";
  return payload
    .split(/\r?\n/)                 // normalize input to logical lines
    .map(line => {
      const bytes = enc.encode(line);
      if (bytes.length <= 75) return line;

      // split at ≤75 octets without breaking multibyte chars
      let parts = [];
      let start = 0;
      while (start < bytes.length) {
        let end = Math.min(start + 75, bytes.length);

        // ensure we don't cut through a UTF-8 multibyte sequence
        while (end > start && (bytes[end] & 0b11000000) === 0b10000000) end--;

        // decode slice safely
        parts.push(new TextDecoder().decode(bytes.slice(start, end)));
        start = end;
      }
      // continuation lines must begin with a single space
      return parts[0] + CRLF + parts.slice(1).map(p => " " + p).join(CRLF);
    })
    .join(CRLF);
}

function buildVCARD(d, opts = {}) {
  const name = stripSpaces(d.name);
  const addr = shortenAddr(d.addr);
  const email = stripSpaces(d.email);
  const phone = stripSpaces(d.phone);
  const tax  = stripSpaces(d.taxId);

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${vcardEscape(name || "")}`,
    `ORG:${vcardEscape(name || "")}`,
    phone ? `TEL;TYPE=CELL:${vcardEscape(phone)}` : "",
    email ? `EMAIL;TYPE=INTERNET:${vcardEscape(email)}` : "",
    // ADR format: PO Box;Extended;Street;Locality;Region;PostalCode;Country
    // If you only have one big address string, putting it in the Street slot is valid.
    addr  ? `ADR;TYPE=WORK:;;${vcardEscape(addr)};;;;` : "",
    tax   ? `NOTE:MST ${vcardEscape(tax)}` : "",
    "END:VCARD"
  ].filter(Boolean);

  // vCard spec prefers CRLF line endings
  let payload = lines.join("\r\n");
  if (opts.asciiOnly) payload = removeDiacritics(payload);

  // fold any overlong lines to ≤75 octets
  payload = foldVCardPayload(payload);
  return payload;
}


function buildSimple(d) {
  return `${stripSpaces(d.taxId)}|${stripSpaces(d.name)}|${stripSpaces(d.addr)}|${stripSpaces(d.phone)}|${stripSpaces(d.email)}`;
}

// ===== Modal logic (giữ nguyên các ID bạn đang dùng) =====
(function(){
  const openBtn   = document.getElementById("qrBtn");
  const modal     = document.getElementById("qrModal");
  const box       = document.getElementById("qrBox");
  const closeBtn  = document.getElementById("qrClose");
  const copyBtn   = document.getElementById("qrCopy");
  const dlA       = document.getElementById("qrDownload");
  const sizeSel   = document.getElementById("qrSize");

  if(!openBtn || !modal || !box) return;

  function currentData(){
    return (typeof getSelected==="function" && getSelected()) || {taxId:"",name:"",addr:"",email:"",phone:""};
  }
  function currentFmt(){
    const el = document.querySelector('input[name="qrFmt"]:checked');
    console.log("fmt",el.value);
    return el.value;
  }



  // Thử render với nhiều cấu hình tăng dần dung lượng chứa
  function tryRenderWithFallbacks() {
    const size = parseInt(sizeSel?.value||"240",10);

    // Thứ tự thử: mức sửa lỗi L -> M; không bỏ dấu -> bỏ dấu; MECARD ưu tiên
    const tryPlans = [
      { level: QRCode.CorrectLevel.H, asciiOnly: false },
    //   { level: QRCode.CorrectLevel.L, asciiOnly: false  },
    //   { level: QRCode.CorrectLevel.M, asciiOnly: false },
    //   { level: QRCode.CorrectLevel.M, asciiOnly: false  },
    ];

    const fmt = currentFmt();

    box.innerHTML = "";
    // for (const fmt of formats) {
      for (const plan of tryPlans) {
        try {
          // build theo fmt đang thử
          const payload = (fmt==="VCARD") ? buildVCARD(currentData(), {asciiOnly: plan.asciiOnly})
                                          : (fmt=="MECARD")?buildMECARD(currentData(), {asciiOnly: plan.asciiOnly}):buildSimple(currentData());

          console.log("trying QR:", payload);
          box.innerHTML = "";
          const q = new QRCode(box, {
            text: payload,  // 👈 dùng encode an toàn
            width: size,
            height: size,
            correctLevel: plan.level
          });

          console.log("rented QR",q);

          // download link (đợi DOM render xong)
          setTimeout(()=>{
            const img = box.querySelector("img,canvas");
            try {
              dlA.href = (img && img.tagName==="CANVAS") ? img.toDataURL("image/png")
                                                         : (img ? img.src : "#");
            } catch {}
          }, 40);

          // copy payload
          if (copyBtn) {
            copyBtn.onclick = async ()=>{
              try {
                await navigator.clipboard.writeText(payload);
                copyBtn.textContent = "Đã sao chép";
                setTimeout(()=>copyBtn.textContent = "Sao chép dữ liệu", 1500);
              } catch {}
            };
          }

          // Nếu render thành công, hiển thị chú thích phương án đã dùng (tuỳ thích)
          // Bạn có thể gắn 1 <small id="qrHint">...</small> để báo "MECARD / L / ASCII" v.v.
          return true;
        } catch (err) {
          // Nếu tràn, thử phương án tiếp theo
          console.warn("QR fallback", fmt, plan, err);
        }
      }
    // }

    // Không render được
    // box.innerHTML = `
    //   <div class="text-sm text-rose-600">
    //     Payload quá dài để tạo QR. Hãy chọn MECARD, hạ mức sửa lỗi, hoặc rút gọn nội dung.
    //   </div>`;
    dlA.removeAttribute("href");
    return false;
  }

  function open(){ modal.classList.remove("hidden"); modal.classList.add("flex"); tryRenderWithFallbacks(); }
  function close(){ modal.classList.add("hidden"); modal.classList.remove("flex"); }

  openBtn.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  modal.addEventListener("click", (e)=>{ if(e.target===modal) close(); });
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") close(); });
  sizeSel?.addEventListener("change", tryRenderWithFallbacks);
  document.addEventListener("change", (e)=>{ if(e.target && e.target.name==="qrFmt") tryRenderWithFallbacks(); });
})();
