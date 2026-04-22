# NERIUM PROJECT HANDOFF PROMPT

Salin seluruh isi di bawah ini ke sesi Claude yang baru. Lampirkan juga:
1. NERIUM_PRD.pdf
2. AGENT_STRUCTURE.md

---

```
<context>
Gw lampirin 2 file:

1. NERIUM_PRD.pdf — Product Requirements Document lengkap untuk
   proyek gw bernama "Nerium". Ini dokumen formal berbahasa Indonesia
   yang sudah final dari sesi brainstorming sebelumnya. Baca dan pahami
   SELURUH isinya sebelum merespons.

2. AGENT_STRUCTURE.md — Contoh nyata pipeline multi-agent yang gw buat
   secara MANUAL untuk proyek "Personal Investment AI Assistant (IDX)".
   File ini bukan bagian dari Nerium, tapi merupakan PROOF OF CONCEPT
   dari apa yang Nerium Builder ingin otomasi. File ini menunjukkan
   bagaimana 30+ named agents (Orion, Theron, Raphael, Konstantin, dst.)
   diorganisir dalam 106 langkah, 9 fase, dari Genesis sampai Validation,
   dengan input/output/handoff chain yang eksplisit. Nerium Builder
   bertujuan mengotomasi seluruh pipeline seperti ini sehingga user cukup
   approve/revise di checkpoint strategis tanpa harus mengorkestrasi
   setiap handoff secara manual.
</context>

<background>
Nerium adalah platform infrastruktur untuk ekonomi AI agent global,
terdiri dari 5 pilar yang masing-masing bisa menjadi startup mandiri:

1. NERIUM BUILDER — Gamified product construction platform. User
   mendeskripsikan ide, platform memandu mereka melalui seluruh proses
   build (ideasi > validasi > arsitektur > development > QA > deployment)
   menggunakan metafora konstruksi gedung. AI agent yang terorganisir
   dalam 3 tier (Advisor > Leads > Workers) mengeksekusi seluruh
   pipeline secara otomatis. User cukup approve di checkpoint.

2. NERIUM MARKETPLACE — Open platform untuk jual-beli AI agent. BUKAN
   pelengkap Builder. Ini produk mandiri yang menerima agent dari sumber
   manapun (hand-coded, Cursor, Claude Code, Replit, dsb). Fitur kunci:
   agent templates yang "living" — bisa dibeli lalu dikustomisasi secara
   otomatis lewat pipeline Builder (misal: beli template pertanian cabai,
   bilang "ubah ke anggur", otomatis dimodifikasi).

3. NERIUM BANKING — Financial infrastructure untuk agent yang beroperasi
   live. Usage-based billing, agent wallet, transaction processing.
   Seperti Stripe tapi khusus untuk AI agent economy.

4. NERIUM REGISTRY — Identity dan trust layer. Setiap agent punya "KTP":
   identitas terverifikasi, trust score, audit trail, verified capabilities.
   Seperti DNS tapi untuk AI agent.

5. NERIUM PROTOCOL — Communication standard lintas-model AI. BUKAN
   memaksa semua AI bicara satu bahasa. Ini translation/adapter layer
   yang memastikan pesan antar model (Claude, Gemini, DeepSeek, dll)
   diterjemahkan ke format optimal masing-masing. Claude tetap terima
   XML tags, Gemini tetap pakai caranya, dll. Protocol handle translation.

Positioning strategis: Nerium BUKAN perusahaan AI. Nerium adalah
infrastruktur yang duduk di atas SEMUA perusahaan AI. Analoginya:
- Google tidak bikin website tapi kontrol cara orang nemuin website
- Visa tidak punya bank tapi kontrol aliran uang antar bank
- Nerium tidak bikin AI model tapi kontrol bagaimana agent dibuat,
  diperdagangkan, dibayar, diverifikasi, dan berkomunikasi

Lifecycle lengkap: orang datang > BUILD agent (Builder) > JUAL di
marketplace (Marketplace) > buyer BAYAR usage (Banking) > agent punya
IDENTITAS terpercaya (Registry) > agent KOMUNIKASI lintas model (Protocol)
</background>

<key_decisions>
Keputusan-keputusan yang sudah final dari sesi sebelumnya:

- Marketplace adalah OPEN PLATFORM, bukan eksklusif untuk agent yang
  dibuat di Builder. Agent dari sumber manapun bisa masuk.
- Marketplace bukan "pembantu" Builder. Keduanya adalah produk yang
  setara dan independen. Dua entry point yang equal.
- Protocol bukan "paksa semua AI ngomong satu bahasa" tapi
  "translation layer yang preserve keunikan setiap model."
- User bebas memilih model AI mana yang dipakai untuk setiap aspek
  proyek (misal Claude untuk backend, Gemini untuk frontend).
- Kelima pilar masing-masing berdiri sendiri tapi flywheel effect
  memperkuat satu sama lain.
- Nama "Nerium" belum final, masih bisa berubah.
- Technical implementation dikesampingkan dulu, fokus ke bisnis dan
  konsep dulu.
- Target mulai development: November 2026.
</key_decisions>

<market_context>
Data pasar yang sudah di-research:
- AI agent market: USD 5.1B (2024) -> USD 47-52B (2030), CAGR 41-46%
- Coding/software dev segment: CAGR 52.4%
- Multi-agent systems: CAGR 48.5%
- Protokol: MCP (Anthropic, tool connection), A2A (Google, agent-to-agent),
  ACP (IBM, messaging) — ketiganya komplementer, bukan kompetitor
- Gartner: 40% enterprise apps will have task-specific agents by 2027
- Sam Altman (CEO OpenAI) menyatakan AI akan jadi utilitas seperti
  listrik/air, dibayar per usage — ini align langsung dengan Pilar 3
  (Banking) Nerium
- Kompetitor Builder: Lovable, Bolt.new, Replit Agent, Cursor — semua
  masih single-slice, tidak end-to-end, tidak gamified, black box
- Kompetitor Marketplace: Google Cloud AI Marketplace, ADP Marketplace,
  Picsart agent marketplace — semua niche-specific, tidak open/general
</market_context>

<brainstorming_transcript>
Berikut adalah rangkuman percakapan brainstorming asli antara gw dan
Claude sebelumnya. Ini penting untuk memahami NUANSA dan REASONING
di balik setiap keputusan, yang tidak sepenuhnya tercapture di PRD formal.

AWAL: Gw punya PRD kasar bernama "FounderQuest" — konsepnya gamified
AI agent platform yang deliver "ide -> aplikasi production grade" secara
otomatis. Metafora gedung pencakar langit, 3-tier agent, game phases,
semua itu sudah ada dari awal.

IDE MARKETPLACE: Gw bilang di X/GitHub udah banyak banget aplikasi bagus
yang dibuat lewat vibe coding, muncul terus yang baru dan lebih bagus.
Ada yang jual juga. Gw mau tambahin marketplace agent. Tapi bukan
sebagai pembantu fitur utama — gw tekanin bahwa marketplace itu STANDALONE.
Analogi yang gw pake: fitur utama itu kayak full kitchen set, marketplace
itu bukan buku resep buat kitchen itu, tapi SUPERMARKET tersendiri.
Dua entry point yang equal. Template yang dibeli bisa dikustomisasi
otomatis lewat pipeline Builder (misal: beli agent pertanian cabai,
bilang "ubah ke anggur", otomatis dimodif).

IDE BANKING: Gw bilang di masa depan AI yang dijual secara API bakal
sangat banyak. Ada yang buat IoT, pertanian, dll. Semuanya butuh
pembayaran per usage. Gw mau ada "sistem bank" di dalam ecosystem.
Jadi Nerium jadi "rekening bank"-nya agent. Creator jual agent via API,
buyer bayar per usage, Nerium handle semua transaksi.

IDE REGISTRY: Ini muncul dari diskusi soal gimana caranya ekonomi agent
gak jadi wild west. Setiap agent butuh "KTP" — identity, verified
capabilities, trust score, track record. Tanpa ini, orang gak tau mana
agent yang legit dan mana yang sampah.

IDE PROTOCOL: Gw ngasih 3 screenshot dari X yang nunjukin:
(a) pixel office buat visualisasi AI crew
(b) chat room dimana Claude/Codex/Gemini literally ngobrol saling tag
(c) 3D visualization dari 7 Claude Code agents running parallel.
Ini proof bahwa multi-agent communication itu real demand. Tapi gw
tekanin: protocol-nya JANGAN sampai ngerubah esensi setiap model.
Claude harus tetep dapet XML tags, Claude Code tetep pake CLAUDE.md
dan ultrathink, Gemini pake cara Gemini. Jadi protocol-nya itu kayak
diplomat/interpreter, bukan memaksa semua orang ngomong bahasa yang sama.
User juga bebas milih mau pake AI mana aja dan model apa aja.

FRAMING KESELURUHAN: Gw bilang pemikiran gw: AI company bakal banyak
banget (Anthropic, Google, OpenAI, DeepSeek, dan ratusan yang kecil).
Gw pengen jadi yang KONTROL ECOSYSTEM AI-nya. Bukan jadi another AI
company, tapi jadi infrastructure layer di atasnya. Total 5 "aplikasi
edan" yang digabung jadi satu: kayak ngegabungin Tokopedia + Minecraft
+ Stripe + DNS + HTTP jadi satu platform.

SOAL AGENT_STRUCTURE.md: Gw kasih file ini biar Claude ngerti gimana
prosesnya kalau dilakuin MANUAL. Gw harus buka sesi Claude satu-satu,
ketik "Hai claude gw punya PRD ini bikinin structure agentnya" terus
copy output, buka sesi lain, "Hai claude bikinin prompt untuk masing-
masing agent dari structure ini", dan seterusnya 100+ langkah. Nerium
Builder mengotomasi SEMUA itu. User tinggal approve/revise aja.

VALIDASI SAM ALTMAN: Gw nunjukin post Instagram yang ngutip Sam Altman
bilang "AI akan jadi tagihan bulanan kamu" — dijual per meter kayak
listrik/air. Ini langsung validasi Pilar 3 (Banking) Nerium. Kalau AI
jadi utilitas yang dibayar per usage, siapa yang jadi PLN/PDAM-nya?
Itu Nerium.
</brainstorming_transcript>

<my_profile>
Gw Ghaisan, mahasiswa D4 Teknik Informatika semester 2 di Politeknik
Negeri Bandung (POLBAN). Experience: Java, C/C++, Python, JS/React/Next.js,
Golang/Gin, Flutter, PostgreSQL. Gw punya pengalaman langsung membangun
multi-agent AI pipeline secara manual (bukti: AGENT_STRUCTURE.md yang
dilampirkan). Gw berkomunikasi casual pake gw/lu.
</my_profile>

<instructions>
Setelah membaca kedua file dan seluruh konteks di atas:

1. Konfirmasi singkat (2-3 kalimat) bahwa lu memahami keseluruhan proyek.
2. Sebutkan 5 poin kunci yang lu tangkap untuk gw validasi.
3. Tanya gw mau lanjut ke mana — gw yang tentuin arah diskusi berikutnya.

Jangan ulangi seluruh PRD. Jangan rangkum panjang-panjang. Cukup buktikan
lu paham, lalu tunggu arahan gw.

Komunikasi: casual bahasa Indonesia (gw/lu), langsung to the point,
jangan pake emoji, jangan pake em dash (--).
</instructions>
```
