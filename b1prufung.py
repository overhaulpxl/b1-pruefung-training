import tkinter as tk
from tkinter import messagebox
import threading, time, importlib, importlib.util, sys, os
from soal_data import kuis_b1_lesen as _default_soal

# ── Discover paket files ───────────────────────────────────────────────────────
def _discover_paket():
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    paket = {"Paket 1 (default)": _default_soal}
    for fname in sorted(os.listdir(base)):
        if fname.startswith("paket_") and fname.endswith(".py"):
            label = fname[:-3].replace("_", " ").title()
            spec  = importlib.util.spec_from_file_location(fname[:-3], os.path.join(base, fname))
            mod   = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
                soal = getattr(mod, "kuis_b1_lesen", None)
                if soal: paket[label] = soal
            except Exception: pass
    return paket

ALL_PAKET = _discover_paket()

# ── Palette ───────────────────────────────────────────────────────────────────
BG        = "#f0f4f8"
PANEL_BG  = "#ffffff"
HDR_BG    = "#1a1d2e"
SECT_BG   = "#f0f4f8"
ACCENT    = "#2563eb"
ACCENT_H  = "#1d4ed8"
BTN_GRAY  = "#64748b"
BTN_GRAY_H= "#475569"
TEXT_DARK = "#0f172a"
TEXT_MED  = "#475569"
TEXT_LIGHT= "#ffffff"
MUTED     = "#94a3b8"
BORDER    = "#e2e8f0"
TIMER_CLR = "#f0e68c"

TEIL_COLOR = {1:"#2980b9", 2:"#27ae60", 3:"#8e44ad", 4:"#d35400", 5:"#c0392b"}

INSTRUCT = {
    "richtig_falsch_2": (
        "Lesen Sie den Text und die Aufgaben dazu.\n"
        "Wählen Sie: Sind die Aussagen Richtig oder Falsch?"
    ),
    "pilihan_ganda": (
        "Lesen Sie den Text. Wählen Sie die richtige Antwort a, b oder c."
    ),
    "zuordnung": (
        "Lesen Sie die Situationen. Welche Anzeige passt?\n"
        "Wählen Sie den richtigen Buchstaben (a–j) oder 0 = keine passende Anzeige."
    ),
    "ja_nein": (
        "Lesen Sie die Leserbriefe.\n"
        "Findet die Person, dass Einzelkinder es besser haben? Wählen Sie: Ja oder Nein."
    ),
}
TOTAL_WAKTU = 65 * 60


# ─────────────────────────────────────────────────────────────────────────────
class FlatBtn(tk.Button):
    def __init__(self, parent, text, command, bg, fg="#fff",
                 hbg=None, width=None, fs=10, px=16, py=8, **kw):
        self._bg = bg; self._hbg = hbg or bg
        cfg = dict(text=text, command=command, bg=bg, fg=fg,
                   activebackground=self._hbg, activeforeground=fg,
                   font=("Segoe UI", fs, "bold"), relief="flat",
                   bd=0, cursor="hand2", padx=px, pady=py)
        if width: cfg["width"] = width
        super().__init__(parent, **cfg, **kw)
        self.bind("<Enter>", lambda e: self.config(bg=self._hbg))
        self.bind("<Leave>", lambda e: self.config(bg=self._bg))

    def set_style(self, bg, hbg=None):
        self._bg = bg; self._hbg = hbg or bg
        self.config(bg=bg, activebackground=self._hbg)


# ─────────────────────────────────────────────────────────────────────────────
class PaketPicker(tk.Toplevel):
    def __init__(self, parent, paket_dict, current=None):
        super().__init__(parent)
        self.title("Pilih Paket Soal")
        self.configure(bg=HDR_BG); self.resizable(False, False); self.grab_set()
        self.chosen = None
        tk.Label(self, text="📂  Pilih Paket Soal",
                 font=("Segoe UI", 13, "bold"), fg=TEXT_LIGHT, bg=HDR_BG
                 ).pack(pady=(18, 4), padx=30)
        frm = tk.Frame(self, bg=HDR_BG); frm.pack(padx=30, pady=6, fill="x")
        for name in paket_dict:
            FlatBtn(frm, name, lambda n=name: self._pick(n),
                    bg="#2980b9" if name == current else "#2c3e50",
                    hbg=ACCENT_H, width=30).pack(pady=3, fill="x")
        FlatBtn(self, "Batal", self.destroy, bg="#922b21", hbg="#7b241c"
                ).pack(pady=(4, 18))
        self.protocol("WM_DELETE_WINDOW", self.destroy)
        self.update_idletasks()
        ox = parent.winfo_x() + (parent.winfo_width()  - self.winfo_width())  // 2
        oy = parent.winfo_y() + (parent.winfo_height() - self.winfo_height()) // 2
        self.geometry(f"+{ox}+{oy}")
        parent.wait_window(self)

    def _pick(self, name):
        self.chosen = name; self.destroy()


# ─────────────────────────────────────────────────────────────────────────────
class KuisApp:
    def __init__(self, root, soal_list=None, paket_name="Paket 1 (default)"):
        self.root       = root
        self.paket_name = paket_name
        self._soal_src  = soal_list or _default_soal
        self.root.title(f"B1 Prüfung – coded by Zaidaan – {paket_name}")
        self.root.geometry("1120x820")
        self.root.minsize(900, 680)
        self.root.configure(bg=BG)
        self._init_state()
        self._build_ui()
        self._show_section(0)
        self._mulai_timer()

    # ── State ─────────────────────────────────────────────────────────────────
    def _init_state(self):
        self.soal_list    = self._soal_src[:]
        self.current_sec  = 0
        self.skor         = 0
        self.sisa_waktu   = TOTAL_WAKTU
        self.timer_aktif  = True
        self.selesai_flag = False
        self.hasil        = {}          # {soal_id: (benar, jawaban)}
        self.pilihan_vars = {}          # {soal_id: StringVar}
        self.font_scale   = 1.0         # zoom level
        self._build_sections()
        self._init_vars()

    def _build_sections(self):
        secs = {}
        for soal in self.soal_list:
            t = soal["teil"]
            if t not in secs:
                secs[t] = dict(teil=t, tipe=soal["tipe"],
                               tipe_soal=soal["tipe_soal"], soal_list=[])
            secs[t]["soal_list"].append(soal)
        self.sections = [secs[k] for k in sorted(secs)]

    def _init_vars(self):
        for soal in self.soal_list:
            v = tk.StringVar(value="None")
            self.pilihan_vars[soal["id"]] = v
            v.trace_add("write", lambda *a, sid=soal["id"]: self._on_answer(sid))

    def _on_answer(self, sid):
        soal    = next(s for s in self.soal_list if s["id"] == sid)
        jawaban = self.pilihan_vars[sid].get()
        if jawaban and jawaban != "None":
            self.hasil[sid] = (jawaban == soal["jawaban_benar"], jawaban)
            self.skor = sum(1 for v in self.hasil.values() if v[0])
            self._update_answered_label()

    # ── Build UI ──────────────────────────────────────────────────────────────
    def _build_ui(self):
        # ── TOP HEADER ────────────────────────────────────────────────────────
        hdr = tk.Frame(self.root, bg=HDR_BG, pady=10)
        hdr.pack(fill="x")

        brnd = tk.Frame(hdr, bg=HDR_BG)
        brnd.pack(side="left", padx=18)
        # German flag drawn as canvas
        flag = tk.Canvas(brnd, width=32, height=20, bg=HDR_BG, highlightthickness=0)
        flag.create_rectangle(0,  0, 32,  7, fill="#000000", outline="")
        flag.create_rectangle(0,  7, 32, 14, fill="#DD0000", outline="")
        flag.create_rectangle(0, 14, 32, 20, fill="#FFCE00", outline="")
        flag.pack(side="left", padx=(0, 6))
        tk.Label(brnd, text="  B1 Prüfung",
                 font=("Segoe UI", 12, "bold"), fg=TEXT_LIGHT, bg=HDR_BG).pack(side="left")
        tk.Label(brnd, text="  ·  coded by Zaidaan",
                 font=("Segoe UI", 9), fg=MUTED, bg=HDR_BG).pack(side="left")

        rh = tk.Frame(hdr, bg=HDR_BG)
        rh.pack(side="right", padx=18)
        self.lbl_sec_prog = tk.Label(rh, text="",
                                     font=("Segoe UI", 12, "bold"),
                                     fg=TEXT_LIGHT, bg=HDR_BG)
        self.lbl_sec_prog.pack(side="right", padx=(12, 0))
        self.lbl_paket = tk.Label(rh, text=f"📂 {self.paket_name}",
                                  font=("Segoe UI", 8), fg=MUTED,
                                  bg=HDR_BG, cursor="hand2")
        self.lbl_paket.pack(side="right")
        self.lbl_paket.bind("<Button-1>", lambda e: self._ganti_paket())

        self.lbl_timer = tk.Label(hdr, text="⏱  65:00",
                                  font=("Consolas", 15, "bold"),
                                  fg=TIMER_CLR, bg=HDR_BG)
        self.lbl_timer.pack(side="left", expand=True)

        # ── SECTION HEADER BAR ─────────────────────────────────────────────────
        self.sect_bar = tk.Frame(self.root, bg=SECT_BG, pady=8)
        self.sect_bar.pack(fill="x")
        inl = tk.Frame(self.sect_bar, bg=SECT_BG)
        inl.pack(fill="x", padx=20)
        self.lbl_sect = tk.Label(inl, text="",
                                 font=("Segoe UI", 12, "bold"),
                                 fg=TEXT_DARK, bg=SECT_BG)
        self.lbl_sect.pack(side="left")
        self.lbl_answered = tk.Label(inl, text="",
                                     font=("Segoe UI", 9), fg=MUTED, bg=SECT_BG)
        self.lbl_answered.pack(side="right", padx=(8, 0))
        # Zoom buttons
        zoom_f = tk.Frame(inl, bg=SECT_BG)
        zoom_f.pack(side="right")
        FlatBtn(zoom_f, "−", lambda: self._zoom(-1), bg=BTN_GRAY, hbg=BTN_GRAY_H,
                fs=11, px=8, py=2).pack(side="left", padx=(0, 1))
        FlatBtn(zoom_f, "+", lambda: self._zoom(+1), bg=BTN_GRAY, hbg=BTN_GRAY_H,
                fs=11, px=8, py=2).pack(side="left", padx=(0, 8))
        tk.Frame(self.root, bg=BORDER, height=1).pack(fill="x")

        # ── BOTTOM BAR (packed before main to always stay visible) ─────────────
        bot = tk.Frame(self.root, bg=PANEL_BG, pady=10)
        bot.pack(side="bottom", fill="x")
        tk.Frame(self.root, bg=BORDER, height=1).pack(side="bottom", fill="x")

        self.btn_prev = FlatBtn(bot, "◀  Sebelumnya", self._prev_sec,
                                bg=BTN_GRAY, hbg=BTN_GRAY_H, fs=10)
        self.btn_prev.pack(side="left", padx=(20, 8))

        self.dots_frame = tk.Frame(bot, bg=PANEL_BG)
        self.dots_frame.pack(side="left", expand=True)

        self.btn_finish = FlatBtn(bot, "🏁  Selesai & Rekap", self._selesai,
                                  bg="#8e44ad", hbg="#6c3483", fs=10)
        self.btn_finish.pack(side="right", padx=(8, 20))

        self.btn_next = FlatBtn(bot, "Selanjutnya  ▶", self._next_sec,
                                bg=ACCENT, hbg=ACCENT_H, fs=10)
        self.btn_next.pack(side="right", padx=8)

        self.btn_restart = FlatBtn(bot, "🔄  Ulangi Kuis", self.restart,
                                   bg=BTN_GRAY, hbg=BTN_GRAY_H, fs=10)

        # ── MAIN BODY (two columns) ────────────────────────────────────────────
        self.main_frame = tk.Frame(self.root, bg=BG)
        self.main_frame.pack(fill="both", expand=True)

        # LEFT — reading text
        self.left_panel = tk.Frame(self.main_frame, bg=PANEL_BG)
        self.left_panel.pack(side="left", fill="both", expand=True)

        self.lbl_instruct = tk.Label(self.left_panel, text="",
                                     font=("Segoe UI", 9, "italic"),
                                     fg=TEXT_MED, bg=PANEL_BG,
                                     wraplength=420, justify="left")
        self.lbl_instruct.pack(anchor="w", padx=16, pady=(12, 4))

        txt_wrap = tk.Frame(self.left_panel, bg=PANEL_BG)
        txt_wrap.pack(fill="both", expand=True, padx=(14, 4), pady=(0, 12))
        self.txt = tk.Text(txt_wrap, wrap="word",
                           font=("Georgia", 10),
                           bg=PANEL_BG, fg=TEXT_DARK,
                           relief="flat", bd=0, padx=10, pady=8,
                           selectbackground="#bfdbfe")
        sb_l = tk.Scrollbar(txt_wrap, command=self.txt.yview, bg=BG)
        self.txt.configure(yscrollcommand=sb_l.set)
        self.txt.pack(side="left", fill="both", expand=True)
        sb_l.pack(side="right", fill="y")
        self.txt.config(state=tk.DISABLED)

        # Divider
        tk.Frame(self.main_frame, bg=BORDER, width=1).pack(side="left", fill="y")

        # RIGHT — scrollable questions
        self.right_panel = tk.Frame(self.main_frame, bg=BG)
        self.right_panel.pack(side="left", fill="both", expand=True)

        self.cv_q = tk.Canvas(self.right_panel, bg=BG, highlightthickness=0)
        sb_r = tk.Scrollbar(self.right_panel, orient="vertical",
                            command=self.cv_q.yview, bg=BG)
        self.cv_q.configure(yscrollcommand=sb_r.set)
        sb_r.pack(side="right", fill="y")
        self.cv_q.pack(side="left", fill="both", expand=True)

        self.q_frame = tk.Frame(self.cv_q, bg=BG)
        self._qwin = self.cv_q.create_window((0, 0), window=self.q_frame, anchor="nw")
        self.q_frame.bind("<Configure>",
            lambda e: self.cv_q.configure(scrollregion=self.cv_q.bbox("all")))
        self.cv_q.bind("<Configure>",
            lambda e: self.cv_q.itemconfig(self._qwin, width=e.width))
        self.cv_q.bind("<MouseWheel>",
            lambda e: self.cv_q.yview_scroll(-1 * (e.delta // 120), "units"))
        self.q_frame.bind("<MouseWheel>",
            lambda e: self.cv_q.yview_scroll(-1 * (e.delta // 120), "units"))

    # ── Section display ────────────────────────────────────────────────────────
    def _show_section(self, idx):
        self.current_sec = idx
        sec  = self.sections[idx]
        n    = len(self.sections)
        col  = TEIL_COLOR.get(sec["teil"], ACCENT)

        self.lbl_sect.config(text=f"Lesen {idx + 1}  ─  {sec['tipe']}", fg=col)
        self.lbl_sec_prog.config(text=f"{idx + 1} | {n}")
        self.lbl_instruct.config(text=INSTRUCT.get(sec["tipe_soal"], ""))

        # Reading text — unique texts combined with dividers
        texts_seen, combined = [], []
        for soal in sec["soal_list"]:
            if soal["teks"] not in texts_seen:
                texts_seen.append(soal["teks"])
                combined.append(soal["teks"])
        self.txt.config(state=tk.NORMAL)
        self.txt.delete("1.0", tk.END)
        self.txt.insert(tk.END, ("\n\n" + "─" * 40 + "\n\n").join(combined))
        self.txt.config(state=tk.DISABLED)
        self.txt.yview_moveto(0)

        # Build question cards
        for w in self.q_frame.winfo_children():
            w.destroy()
        for soal in sec["soal_list"]:
            self._make_card(self.q_frame, soal, sec["tipe_soal"])

        # Nav buttons
        self.btn_prev.config(state="normal" if idx > 0 else "disabled")
        self.btn_next.config(state="normal" if idx < n - 1 else "disabled")
        self._update_dots()
        self._update_answered_label()
        self.cv_q.yview_moveto(0)

    def _make_card(self, parent, soal, tipe_soal):
        """Build one question card on the right panel."""
        fs = self.font_scale  # shorthand
        fq = max(8, int(11 * fs))   # question bold
        fb = max(8, int(12 * fs))   # binary button
        fo = max(8, int(10 * fs))   # option label
        fd = max(8, int(11 * fs))   # dot

        card = tk.Frame(parent, bg=PANEL_BG, padx=20, pady=14)
        card.pack(fill="x", padx=10, pady=(0, 2))

        def _scroll(e):
            self.cv_q.yview_scroll(-1 * (e.delta // 120), "units")
        card.bind("<MouseWheel>", _scroll)

        # Question text
        q_lbl = tk.Label(card, text=soal["pertanyaan"],
                         font=("Segoe UI", fq, "bold"),
                         fg=TEXT_DARK, bg=PANEL_BG,
                         wraplength=430, justify="left", anchor="w")
        q_lbl.pack(fill="x", anchor="w", pady=(0, 10))
        q_lbl.bind("<MouseWheel>", _scroll)

        var   = self.pilihan_vars[soal["id"]]
        items = list(soal["pilihan"].items())

        if tipe_soal in ("richtig_falsch_2", "ja_nein"):
            btn_row  = tk.Frame(card, bg=PANEL_BG)
            btn_row.pack(anchor="w")
            btn_refs = {}

            def _pick_binary(k, refs, v):
                v.set(k)
                for key, btn in refs.items():
                    if key == k:
                        btn.config(bg=ACCENT, fg="#ffffff")
                    else:
                        btn.config(bg="#e2e8f0", fg=TEXT_DARK)

            for kunci, label in items:
                btn = tk.Button(
                    btn_row, text=f"  {label}  ",
                    font=("Segoe UI", fb, "bold"),
                    fg=TEXT_DARK, bg="#e2e8f0",
                    activebackground=ACCENT_H, activeforeground="#fff",
                    relief="flat", bd=0, padx=22, pady=10,
                    cursor="hand2",
                    command=lambda k=kunci: _pick_binary(k, btn_refs, var))
                btn.pack(side="left", padx=(0, 10))
                btn.bind("<MouseWheel>", _scroll)
                btn_refs[kunci] = btn

            prev = var.get()
            if prev and prev != "None" and prev in btn_refs:
                _pick_binary(prev, btn_refs, var)

        else:
            row_refs = {}

            def _pick_option(k, refs, v):
                v.set(k)
                for key, fr in refs.items():
                    col = "#dbeafe" if key == k else PANEL_BG
                    fr.config(bg=col)
                    for child in fr.winfo_children():
                        try: child.config(bg=col)
                        except Exception: pass

            for kunci, label in items:
                opt_f = tk.Frame(card, bg=PANEL_BG, padx=8, pady=6,
                                 cursor="hand2")
                opt_f.pack(fill="x", pady=1)

                dot = tk.Label(opt_f, text="○",
                               font=("Segoe UI", fd), fg=ACCENT,
                               bg=PANEL_BG, width=2)
                dot.pack(side="left")

                lbl = tk.Label(opt_f, text=label,
                               font=("Segoe UI", fo),
                               fg=TEXT_DARK, bg=PANEL_BG,
                               wraplength=400, justify="left", anchor="w")
                lbl.pack(side="left", fill="x", expand=True)

                for w in (opt_f, dot, lbl):
                    w.bind("<MouseWheel>", _scroll)
                    w.bind("<Button-1>",
                           lambda e, k=kunci: _pick_option(k, row_refs, var))

                row_refs[kunci] = opt_f

            prev = var.get()
            if prev and prev != "None" and prev in row_refs:
                _pick_option(prev, row_refs, var)

        tk.Frame(card, bg=BORDER, height=1).pack(fill="x", pady=(10, 0))


    # ── Dots navigation ────────────────────────────────────────────────────────
    def _update_dots(self):
        for w in self.dots_frame.winfo_children():
            w.destroy()
        n = len(self.sections)
        for i in range(n):
            col = TEIL_COLOR.get(self.sections[i]["teil"], ACCENT) \
                  if i == self.current_sec else MUTED
            lbl = tk.Label(self.dots_frame, text="●",
                           font=("Segoe UI", 12), fg=col, bg=PANEL_BG,
                           cursor="hand2")
            lbl.pack(side="left", padx=4)
            lbl.bind("<Button-1>", lambda e, idx=i: self._show_section(idx))

    def _update_answered_label(self):
        total    = len(self.soal_list)
        answered = len(self.hasil)
        sec      = self.sections[self.current_sec]
        sec_ids  = {s["id"] for s in sec["soal_list"]}
        sec_ans  = sum(1 for sid in sec_ids if sid in self.hasil)
        sec_tot  = len(sec_ids)
        self.lbl_answered.config(
            text=f"{sec_ans} / {sec_tot} dijawab di bagian ini   ·   "
                 f"{answered} / {total} total")

    # ── Navigation ────────────────────────────────────────────────────────────
    def _prev_sec(self):
        if self.current_sec > 0:
            self._show_section(self.current_sec - 1)

    def _next_sec(self):
        if self.current_sec < len(self.sections) - 1:
            self._show_section(self.current_sec + 1)

    # ── Zoom ──────────────────────────────────────────────────────────────────
    def _zoom(self, direction):
        self.font_scale = max(0.7, min(1.6, self.font_scale + direction * 0.1))
        new_size = max(8, int(10 * self.font_scale))
        self.txt.config(font=("Georgia", new_size))
        if not self.selesai_flag:
            sec = self.sections[self.current_sec]
            for w in self.q_frame.winfo_children():
                w.destroy()
            for soal in sec["soal_list"]:
                self._make_card(self.q_frame, soal, sec["tipe_soal"])
            self.cv_q.yview_moveto(0)

    # ── Timer ─────────────────────────────────────────────────────────────────
    def _mulai_timer(self):
        def _loop():
            while self.sisa_waktu > 0 and self.timer_aktif:
                m, s = divmod(self.sisa_waktu, 60)
                fg = "#ff6b6b" if self.sisa_waktu < 300 else TIMER_CLR
                try:
                    self.lbl_timer.config(text=f"⏱  {m:02d}:{s:02d}", fg=fg)
                except Exception:
                    break
                self.sisa_waktu -= 1
                time.sleep(1)
            if self.sisa_waktu <= 0 and self.timer_aktif:
                try:
                    messagebox.showwarning("Waktu Habis!",
                        "⏰ Waktu 65 menit telah habis!\nSkor akan dihitung sekarang.")
                    self._selesai()
                except Exception:
                    pass
        threading.Thread(target=_loop, daemon=True).start()

    # ── Selesai / Rekap ────────────────────────────────────────────────────────
    def _selesai(self):
        if self.selesai_flag:
            return
        unanswered = len(self.soal_list) - len(self.hasil)
        if unanswered > 0:
            if not messagebox.askyesno("Selesai?",
                    f"Masih ada {unanswered} soal belum dijawab.\n"
                    "Selesaikan dan tampilkan rekap?"):
                return
        self.selesai_flag = True
        self.timer_aktif  = False
        self._show_recap()

    def _show_recap(self):
        total  = len(self.soal_list)
        self.skor = sum(1 for v in self.hasil.values() if v[0])
        pct    = self.skor / total * 100
        status = "BESTANDEN (Lulus) 🎉" if pct >= 60 else "NICHT BESTANDEN (Belum Lulus) 💪"

        per_teil = {}
        for soal in self.soal_list:
            t = soal["teil"]
            per_teil.setdefault(t, {"b": 0, "tot": 0})
            per_teil[t]["tot"] += 1
            if self.hasil.get(soal["id"], (False,))[0]:
                per_teil[t]["b"] += 1

        # Switch layout: hide right panel and divider, widen left for recap
        self.right_panel.pack_forget()
        for w in self.main_frame.winfo_children():
            if isinstance(w, tk.Frame) and w.cget("width") == 1:
                w.pack_forget()

        self.lbl_instruct.config(text="")
        self.lbl_sect.config(text="✅  Rekapitulasi Akhir", fg="#27ae60")
        self.lbl_answered.config(
            text=f"Skor: {self.skor}/{total}  ({pct:.0f}%)  —  {status}")

        # Update bottom bar
        self.btn_prev.pack_forget()
        self.btn_next.pack_forget()
        self.btn_finish.pack_forget()
        self.dots_frame.pack_forget()
        self.btn_restart.pack(side="left", padx=20)

        # Fill recap into text widget — clean light theme
        T = self.txt
        T.config(state=tk.NORMAL, bg="#f8fafc", fg="#1e293b",
                 font=("Segoe UI", 10))
        T.delete("1.0", tk.END)

        T.tag_configure("hdr",     foreground="#1e293b",  font=("Segoe UI", 13, "bold"))
        T.tag_configure("sub",     foreground="#64748b",  font=("Segoe UI",  9, "bold"))
        T.tag_configure("score",   foreground="#0f172a",  font=("Segoe UI", 11))
        T.tag_configure("benar",   foreground="#15803d",  font=("Segoe UI", 10, "bold"))
        T.tag_configure("salah",   foreground="#b91c1c",  font=("Segoe UI", 10, "bold"))
        T.tag_configure("ans",     foreground="#b45309",  font=("Segoe UI", 10))
        T.tag_configure("correct", foreground="#15803d",  font=("Segoe UI", 10))
        T.tag_configure("explain", foreground="#475569",  font=("Segoe UI",  9))
        T.tag_configure("bukti",   foreground="#0369a1",  font=("Segoe UI",  9, "italic"))
        T.tag_configure("skip",    foreground="#94a3b8",  font=("Segoe UI",  9, "italic"))
        T.tag_configure("sep",     foreground="#cbd5e1")

        T.insert(tk.END, "REKAPITULASI AKHIR  ·  B1 Lesen\n", "hdr")
        T.insert(tk.END, "─" * 50 + "\n", "sep")
        T.insert(tk.END,
                 f"  Skor: {self.skor} / {total}     Nilai: {pct:.0f}%\n"
                 f"  {status}\n\n", "score")
        for t, v in sorted(per_teil.items()):
            bar_filled = int(v['b'] / v['tot'] * 10) if v['tot'] else 0
            bar = "█" * bar_filled + "░" * (10 - bar_filled)
            T.insert(tk.END, f"  Teil {t}  [{bar}]  {v['b']}/{v['tot']} benar\n", "sub")
        T.insert(tk.END, "\n" + "─" * 50 + "\n", "sep")

        cur_teil = None
        for soal in self.soal_list:
            if soal["teil"] != cur_teil:
                cur_teil = soal["teil"]
                T.insert(tk.END, f"\n◆ {soal['tipe']}\n", "sub")
                T.insert(tk.END, "─"*55 + "\n", "sep")

            info  = self.hasil.get(soal["id"])
            if info is None:
                T.insert(tk.END, "⬜ ", "skip")
                T.insert(tk.END, soal["pertanyaan"].split("\n")[0] + "\n", "skip")
                T.insert(tk.END, "   (Tidak dijawab)\n\n", "skip")
                continue

            benar = info[0]
            tag   = "benar" if benar else "salah"
            T.insert(tk.END, ("✅ " if benar else "❌ "), tag)
            T.insert(tk.END, soal["pertanyaan"].split("\n")[0] + "\n", tag)
            if not benar:
                kunci = soal["jawaban_benar"]
                T.insert(tk.END,
                         f"   Kamu: {info[1].upper()} – {soal['pilihan'].get(info[1],'–')}\n",
                         "ans")
                T.insert(tk.END,
                         f"   Benar: {kunci.upper()} – {soal['pilihan'][kunci]}\n",
                         "benar")
            T.insert(tk.END, f"   💡 {soal['pembahasan']}\n", "explain")
            if soal.get("highlight"):
                T.insert(tk.END, f"   🔍 \u201c{soal['highlight']}\u201d\n", "bukti")
            T.insert(tk.END, "\n")

        T.config(state=tk.DISABLED)
        T.yview_moveto(0)

    # ── Ganti Paket ───────────────────────────────────────────────────────────
    def _ganti_paket(self):
        global ALL_PAKET
        ALL_PAKET = _discover_paket()
        picker = PaketPicker(self.root, ALL_PAKET, current=self.paket_name)
        if picker.chosen and picker.chosen != self.paket_name:
            self._load_paket(picker.chosen)

    def _load_paket(self, name):
        self.timer_aktif  = False
        self.selesai_flag = False
        self.paket_name   = name
        self._soal_src    = ALL_PAKET[name]
        self.root.title(f"B1 Prüfung Training coded by Zaidaan. – {name}")
        self.lbl_paket.config(text=f"📂 {name}")
        self._init_state()
        self._rebuild_ui_state()
        self.lbl_timer.config(text="⏱  65:00", fg=TIMER_CLR)
        self._show_section(0)
        self._mulai_timer()

    def _rebuild_ui_state(self):
        """Restore layout after recap or paket change."""
        # Re-show divider and right panel
        for w in self.main_frame.winfo_children():
            w.pack_forget()
        self.left_panel.pack(side="left", fill="both", expand=True)
        tk.Frame(self.main_frame, bg=BORDER, width=1).pack(side="left", fill="y")
        self.right_panel.pack(side="left", fill="both", expand=True)

        # Reset bottom bar
        self.btn_restart.pack_forget()
        self.dots_frame.pack(side="left", expand=True)
        self.btn_next.pack(side="right", padx=8)
        self.btn_finish.pack(side="right", padx=(8, 20))
        self.btn_prev.pack(side="left", padx=(20, 8))

        self.txt.config(bg=PANEL_BG, fg=TEXT_DARK, font=("Georgia", 10))

    # ── Restart ───────────────────────────────────────────────────────────────
    def restart(self):
        global ALL_PAKET
        ALL_PAKET = _discover_paket()
        picker = PaketPicker(self.root, ALL_PAKET, current=self.paket_name)
        chosen = picker.chosen or self.paket_name
        self._load_paket(chosen)


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    root = tk.Tk()
    try:
        root.iconbitmap(default="icon.ico")
    except Exception:
        pass
    app = KuisApp(root)
    root.mainloop()