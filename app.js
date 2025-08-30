// ======= Service Worker registration =======
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register("/ptax/sw.js").catch(console.error);
        });
      }

      // ======= PWA install (show modal after 10s, prompt on click only) =======
      let deferredPrompt = null;
      const installBtn = document.getElementById("installBtn");
      const installModal = document.getElementById("installModal");
      const installNow = document.getElementById("installNow");
      const installLater = document.getElementById("installLater");

      const MODAL_SHOWN_FLAG = "pwa_nudge_shown_session";
      const isStandalone = () =>
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

      function showInstallModalOnce() {
        if (!deferredPrompt) return; // only when installable
        if (isStandalone()) return;
        if (sessionStorage.getItem(MODAL_SHOWN_FLAG)) return;
        installModal.classList.add("show"); // our modal only (no native prompt)
        sessionStorage.setItem(MODAL_SHOWN_FLAG, "1");
      }

      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault(); // control the timing
        deferredPrompt = e;
        installBtn.classList.remove("hidden"); // optional header button
        setTimeout(showInstallModalOnce, 5000); // show modal after 5s
      });

      // Header button: user gesture OK to prompt
      installBtn?.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.classList.add("hidden");
        installModal.classList.remove("show");
      });

      // Modal buttons
      installNow.addEventListener("click", async () => {
        if (!deferredPrompt) {
          installModal.classList.remove("show");
          return;
        }
        await deferredPrompt.prompt(); // user gesture: click
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.classList.add("hidden");
        installModal.classList.remove("show");
      });
      installLater.addEventListener("click", () =>
        installModal.classList.remove("show")
      );

      window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        installBtn.classList.add("hidden");
        installModal.classList.remove("show");
      });

      // ======= App state & utils =======
      const statusEl = document.getElementById("status");

      // Sections
      const querySection = document.getElementById("querySection");
      const listSection = document.getElementById("listSection");
      const detailSection = document.getElementById("detailSection");

      // Form controls
      const taxCodeInput = document.getElementById("taxCode");
      const emailInput = document.getElementById("email");
      const phoneInput = document.getElementById("phone");
      const queryBtn = document.getElementById("queryBtn");
      const clearAllBtn = document.getElementById("clearAllBtn");
      const gotoListBtn = document.getElementById("gotoListBtn");

      // List controls
      const listEl = document.getElementById("list");
      const countBadge = document.getElementById("countBadge");
      const addNewBtn = document.getElementById("addNewBtn");

      // Detail controls
    //   const typeBadge = document.getElementById("typeBadge");
      const backToListBtn = document.getElementById("backToListBtn");
      const deleteOneBtn = document.getElementById("deleteOneBtn");
      const editBtn = document.getElementById("editBtn");
      const saveBtn = document.getElementById("saveBtn");
      const cancelBtn = document.getElementById("cancelBtn");

      const d_taxId = document.getElementById("d_taxId");
      const d_name = document.getElementById("d_name");
      const d_addr_view = document.getElementById("d_addr_view");
      const d_email_view = document.getElementById("d_email_view");
      const d_phone_view = document.getElementById("d_phone_view");
      const d_addr_edit = document.getElementById("d_addr_edit");
      const d_email_edit = document.getElementById("d_email_edit");
      const d_phone_edit = document.getElementById("d_phone_edit");
      const d_raw = document.getElementById("d_raw");

      const apiBase = "https://doc.thebase.vn/tax/";
      const STORAGE_KEY = "taxList";
      let selectedId = null;

      function setStatus(msg, type = "info") {
        const colors = {
          info: "text-zinc-600",
          success: "text-emerald-600",
          error: "text-rose-600",
        };
        statusEl.className = `mt-4 text-sm ${colors[type] || colors.info}`;
        statusEl.textContent = msg || "";
      }
      function showOnlyQuery() {
        querySection.classList.remove("hidden-section");
        listSection.classList.add("hidden-section");
        detailSection.classList.add("hidden-section");
      }
      function showOnlyList() {
        querySection.classList.add("hidden-section");
        listSection.classList.remove("hidden-section");
        detailSection.classList.add("hidden-section");
      }
      function showOnlyDetail() {
        querySection.classList.add("hidden-section");
        listSection.classList.add("hidden-section");
        detailSection.classList.remove("hidden-section");
      }
      function isValidTax(code) {
        return /^(?:\d{10}|\d{12}|\d{13})$/.test(code);
      }
      function detectType(code) {
        if (!code)
          return { label: "Không xác định", bg: "#f4f4f5", bd: "#e4e4e7" };
        if (/^\d{13}$/.test(code))
          return { label: "Chi nhánh", bg: "#fffbeb", bd: "#f59e0b40" };
        if (/^\d{12}$/.test(code))
          return { label: "Cá nhân", bg: "#f0fdf4", bd: "#22c55e40" };
        if (/^\d{10}$/.test(code))
          return { label: "Doanh nghiệp", bg: "#f0f9ff", bd: "#0ea5e940" };
        return { label: "Không xác định", bg: "#f4f4f5", bd: "#e4e4e7" };
      }
      function escapeHtml(str) {
        return str.replace(
          /[&<>"']/g,
          (m) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#039;",
            }[m])
        );
      }
      function normalizeData(raw, iemail, iphone) {
        const d = raw && typeof raw === "object" ? raw.data ?? raw : null;
        if (!d) return null;
        const taxId =
          d.id ||
          d.tax_id ||
          d.taxId ||
          d.mst ||
          d.tax ||
          d.code ||
          d.MST ||
          null;
        const name =
          d.name || d.ten || d.company_name || d.ten_cong_ty || d.TEN || null;
        const addr = d.address || d.diachi || d.dia_chi || d.location || null;
        const email = d.email || d.contact_email || iemail || null;
        const phone =
          d.phone ||
          d.sdt ||
          d.so_dien_thoai ||
          d.contact_phone ||
          iphone ||
          null;
        return { taxId, name, addr, email, phone, raw: d };
      }
      function loadAll() {
        try {
          const s = localStorage.getItem(STORAGE_KEY);
          return s ? JSON.parse(s) : [];
        } catch {
          return [];
        }
      }
      function saveAll(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }
      function upsertItem(item) {
        if (!item?.taxId) return;
        const list = loadAll();
        const idx = list.findIndex((x) => x.taxId === item.taxId);
        if (idx >= 0) list[idx] = item;
        else list.unshift(item);
        saveAll(list);
        selectedId = item.taxId;
        renderList();
        renderDetail();
      }
      function deleteItem(taxId) {
        const list = loadAll().filter((x) => x.taxId !== taxId);
        saveAll(list);
        selectedId = null;
        renderList();
        showOnlyList();
      }
      function getSelected() {
        return loadAll().find((x) => x.taxId === selectedId) || null;
      }

      function renderList() {
        const list = loadAll();
        countBadge.textContent = `${list.length} bản ghi`;
        if (!list.length) {
          listEl.innerHTML =
            '<p class="text-sm text-zinc-500">Chưa có dữ liệu. Hãy thêm bản ghi ở màn hình “Tra cứu”.</p>';
          return;
        }
        listEl.innerHTML = list
          .map((item) => {
            const t = detectType(item.taxId);
            return `
          <button class="flex items-center justify-between rounded-xl border p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900" data-action="select" data-id="${
            item.taxId
          }">
            <div class="grow">
              <div class="font-medium">${item.name || "—"}</div>
              <div class="text-xs text-zinc-500 mt-0.5">
                MST: <span class="font-mono">${item.taxId}</span>
                <span class="badge px-2 rounded-md" style="background:${
                  t.bg
                };border-color:${t.bd}">${t.label}</span>
              </div>
              ${
                item.email || item.phone
                  ? `<div class="text-xs text-zinc-500 mt-0.5">${
                      item.email || ""
                    }${item.email && item.phone ? " · " : ""}${
                      item.phone || ""
                    }</div>`
                  : ""
              }
            </div>
            <span class="text-zinc-400">›</span>
          </button>`;
          })
          .join("");
      }

      function renderDetail() {
        const data = getSelected();
        if (!data) {
          d_taxId.textContent = "—";
          d_name.textContent = "—";
          d_addr_view.textContent = "";
          d_email_view.textContent = "";
        //   typeBadge.textContent = "";
        //   typeBadge.style.backgroundColor = "#f4f4f5";
        //   typeBadge.style.borderColor = "#e4e4e7";
          setEditMode(false);
          return;
        }
        d_taxId.textContent = data.taxId || "—";
        d_name.textContent = data.name || "—";
        d_addr_view.textContent = data.addr || "—";
        d_email_view.textContent = data.email || "—";
        d_phone_view.textContent = data.phone || "—";
        

        const t = detectType(data.taxId || "");
        // typeBadge.textContent = t.label;
        // typeBadge.style.backgroundColor = t.bg;
        // typeBadge.style.borderColor = t.bd;

        d_addr_edit.value = data.addr || "";
        d_email_edit.value = data.email || "";
        d_phone_edit.value = data.phone || "";
        setEditMode(false);
      }

      function setEditMode(on) {
        d_addr_view.classList.toggle("hidden", on);
        d_email_view.classList.toggle("hidden", on);
        d_phone_view.classList.toggle("hidden", on);
        d_addr_edit.classList.toggle("hidden", !on);
        d_email_edit.classList.toggle("hidden", !on);
        d_phone_edit.classList.toggle("hidden", !on);
        editBtn.classList.toggle("hidden", on);
        saveBtn.classList.toggle("hidden", !on);
        cancelBtn.classList.toggle("hidden", !on);
      }

      async function fetchAndUpsert(code, iemail, iphone) {
        setStatus("Đang tra cứu…");
        try {
          const res = await fetch(apiBase + encodeURIComponent(code), {
            cache: "no-store",
          });
          if (!res.ok)
            throw new Error(
              "Không lấy được dữ liệu (HTTP " + res.status + ")."
            );
          const json = await res.json();
          const norm = normalizeData(json, iemail, iphone);
          if (!norm) throw new Error("Dữ liệu không hợp lệ.");
          upsertItem(norm);
          setStatus("Đã lưu/cập nhật vào thiết bị của bạn.", "success");
          showOnlyList();
        } catch (err) {
          console.error(err);
          setStatus(err.message || "Có lỗi xảy ra.", "error");
        }
      }

      // ===== Events =====
      queryBtn.addEventListener("click", () => {
        const code = (taxCodeInput.value || "").trim();
        const iemail = (emailInput.value || "").trim();
        const iphone = (phoneInput.value || "").trim();
        if (!code) return setStatus("Hãy nhập mã số thuế.", "error");
        if (!isValidTax(code))
          return setStatus("MST không hợp lệ. Chỉ 10/12/13 số.", "error");
        fetchAndUpsert(code, iemail, iphone);
      });
      ["taxCode", "email", "phone"].forEach((id) => {
        document.getElementById(id).addEventListener("keydown", (e) => {
          if (e.key === "Enter") queryBtn.click();
        });
      });
      clearAllBtn.addEventListener("click", () => {
        if (!confirm("Xoá TẤT CẢ bản ghi?")) return;
        localStorage.removeItem(STORAGE_KEY);
        selectedId = null;
        renderList();
        setStatus("Đã xoá tất cả dữ liệu.", "success");
        showOnlyQuery();
      });
      gotoListBtn.addEventListener("click", () => {
        renderList();
        showOnlyList();
      });

      addNewBtn.addEventListener("click", () => {
        selectedId = null;
        taxCodeInput.value = "";
        emailInput.value = "";
        phoneInput.value = "";
        setStatus("Nhập MST mới và nhấn Thêm.", "info");
        showOnlyQuery();
        taxCodeInput.focus();
      });
      listEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const id = btn.getAttribute("data-id");
        if (!id) return;
        selectedId = id;
        renderDetail();
        showOnlyDetail();
      });

      backToListBtn.addEventListener("click", () => {
        renderList();
        showOnlyList();
      });
      deleteOneBtn.addEventListener("click", () => {
        const data = getSelected();
        if (!data) return;
        if (confirm(`Xoá bản ghi MST ${data.taxId}?`)) deleteItem(data.taxId);
      });
      editBtn.addEventListener("click", () => {
        setEditMode(true);
        d_addr_edit.focus();
      });
      cancelBtn.addEventListener("click", () => {
        renderDetail();
        setEditMode(false);
      });
      saveBtn.addEventListener("click", () => {
        const data = getSelected();
        if (!data) return;
        const list = loadAll();
        const idx = list.findIndex((x) => x.taxId === data.taxId);
        if (idx < 0) return;
        list[idx] = {
          ...list[idx],
          addr: d_addr_edit.value.trim() || null,
          email: d_email_edit.value.trim() || null,
          phone: d_phone_edit.value.trim() || null,
        };
        saveAll(list);
        renderDetail();
        setEditMode(false);
        setStatus("Đã lưu thay đổi.", "success");
      });

      (function init() {
        const list = loadAll();
        if (list.length) {
          renderList();
          showOnlyList();
        } else {
          showOnlyQuery();
        }
      })();

      // ======= iOS Add to Home Screen Hint =======
    const iosInstallModal = document.getElementById("iosInstallModal");
    const iosInstallClose = document.getElementById("iosInstallClose");
    const iosBookmarkBtn = document.getElementById("iosBookmarkBtn");
    const iosSteps = document.getElementById("iosSteps");

    function isIos() {
      return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    }
    function isInStandaloneMode() {
      return ("standalone" in window.navigator) && window.navigator.standalone;
    }

    if (isIos() && !isInStandaloneMode()) {
      // Show after a short delay (once per session)
      if (!sessionStorage.getItem("ios_nudge_shown")) {
        setTimeout(() => {
          iosInstallModal.classList.remove("hidden");
          iosInstallModal.classList.add("flex");
          sessionStorage.setItem("ios_nudge_shown", "1");
        }, 3000);
      }
    }

    iosInstallClose?.addEventListener("click", () => {
      iosInstallModal.classList.add("hidden");
      iosInstallModal.classList.remove("flex");
    });

    

    iosBookmarkBtn?.addEventListener("click", () => {
      // Reveal the step instructions
      iosSteps.classList.remove("hidden");
      iosBookmarkBtn.disabled = true;
      iosBookmarkBtn.textContent = "✅ Làm theo hướng dẫn trên";
    });
