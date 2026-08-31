---
layout: home.njk
title: Planning Poker
---

<section class="relative overflow-hidden">
  <div class="absolute inset-0 -z-10 bg-gradient-to-br from-blue-50 via-white to-emerald-50"></div>
  <div class="max-w-7xl mx-auto px-4 pt-16 pb-20 md:pt-24 md:pb-28">
    <div class="max-w-3xl mx-auto text-center">
      <span class="inline-flex items-center gap-2 rounded-full bg-blue-100 text-blue-700 px-4 py-1.5 text-sm font-medium mb-6">
        ✅ No signup &nbsp;·&nbsp; ✅ No backend &nbsp;·&nbsp; ✅ 100% peer-to-peer
      </span>
      <h1 class="text-4xl md:text-6xl font-extrabold tracking-tight text-gray-900 leading-tight">
        Estimate together,
        <span class="text-primary">without the busywork.</span>
      </h1>
      <p class="mt-6 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
        Planning Poker is a real-time estimation app for distributed software teams. Create a room,
        share the link, and vote — synced instantly with CRDT technology and zero servers holding your data.
      </p>
      <div class="mt-10 flex flex-col sm:flex-row justify-center gap-4">
        <a
          href="/app/"
          class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-600 hover:shadow-xl transition-all"
        >
          Start a Free Session
          <span aria-hidden="true">&rarr;</span>
        </a>
        <a
          href="#how-it-works"
          class="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-8 py-4 text-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          See How It Works
        </a>
      </div>
      <p class="mt-4 text-sm text-gray-500">
        Takes 10 seconds. No account, no credit card, no installs.
        Facilitating? <a href="/app/create-room" class="font-semibold text-primary hover:text-blue-700">Create a room instead &rarr;</a>
      </p>
    </div>
  </div>
</section>

<section class="border-y border-gray-100 bg-white">
  <div class="max-w-7xl mx-auto px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
    <div>
      <p class="text-3xl font-extrabold text-gray-900">0</p>
      <p class="mt-1 text-sm text-gray-500">Servers storing your data</p>
    </div>
    <div>
      <p class="text-3xl font-extrabold text-gray-900">&lt; 10s</p>
      <p class="mt-1 text-sm text-gray-500">To create and share a room</p>
    </div>
    <div>
      <p class="text-3xl font-extrabold text-gray-900">13</p>
      <p class="mt-1 text-sm text-gray-500">Card values, Fibonacci + special</p>
    </div>
    <div>
      <p class="text-3xl font-extrabold text-gray-900">100%</p>
      <p class="mt-1 text-sm text-gray-500">Real-time, peer-to-peer sync</p>
    </div>
  </div>
</section>

<section id="features" class="max-w-7xl mx-auto px-4 py-20 md:py-28">
  <div class="grid gap-12 lg:grid-cols-2 lg:items-center mb-16">
    <div>
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900">Everything your team needs to estimate, nothing it doesn't</h2>
      <p class="mt-4 text-lg text-gray-600">Built for distributed teams who want fast, unbiased consensus without another SaaS subscription.</p>
      <a
        href="/app/"
        class="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-white hover:bg-blue-600 transition-colors"
      >
        Start Estimating Now
        <span aria-hidden="true">&rarr;</span>
      </a>
    </div>
    <img
      src="/assets/img/stock-team-collaberation.png"
      alt="Distributed team collaborating together during a remote planning poker session"
      class="rounded-2xl shadow-lg w-full h-auto object-cover"
      loading="lazy"
    />
  </div>
  <div class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
    <div class="rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div class="text-3xl mb-4">🔗</div>
      <h3 class="text-lg font-semibold text-gray-900">Shareable room links</h3>
      <p class="mt-2 text-gray-600">Create a room and invite your team with a single link. No accounts, no invites to manage.</p>
    </div>
    <div class="rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div class="text-3xl mb-4">🙈</div>
      <h3 class="text-lg font-semibold text-gray-900">Anonymous voting</h3>
      <p class="mt-2 text-gray-600">Votes stay hidden until the facilitator reveals them, reducing anchoring bias in every round.</p>
    </div>
    <div class="rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div class="text-3xl mb-4">⚡</div>
      <h3 class="text-lg font-semibold text-gray-900">Real-time sync</h3>
      <p class="mt-2 text-gray-600">Powered by Yjs CRDT and WebRTC — every vote and reveal updates instantly across all participants.</p>
    </div>
    <div class="rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div class="text-3xl mb-4">🕹️</div>
      <h3 class="text-lg font-semibold text-gray-900">Facilitator controls</h3>
      <p class="mt-2 text-gray-600">Reveal votes, reset rounds, and finalize estimates on your terms with full facilitator control.</p>
    </div>
    <div class="rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div class="text-3xl mb-4">👀</div>
      <h3 class="text-lg font-semibold text-gray-900">Observer role</h3>
      <p class="mt-2 text-gray-600">Stakeholders can join as read-only observers to watch the session without influencing votes.</p>
    </div>
    <div class="rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div class="text-3xl mb-4">💾</div>
      <h3 class="text-lg font-semibold text-gray-900">Local-first persistence</h3>
      <p class="mt-2 text-gray-600">Session state is saved in your browser, so a refresh or dropped connection won't lose your progress.</p>
    </div>
  </div>
</section>

<section id="how-it-works" class="bg-gray-50 border-y border-gray-100">
  <div class="max-w-7xl mx-auto px-4 py-20 md:py-28">
    <div class="max-w-2xl mx-auto text-center mb-12">
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900">From backlog to consensus in four steps</h2>
    </div>
    <img
      src="/assets/img/stock-strategic-roadmap.png"
      alt="Strategic roadmap illustrating a team planning and sequencing backlog items"
      class="rounded-2xl shadow-lg w-full max-w-4xl mx-auto h-auto object-cover mb-16"
      loading="lazy"
    />
    <div class="grid gap-10 md:grid-cols-4">
      <div class="text-center">
        <div class="mx-auto w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">1</div>
        <h3 class="mt-4 font-semibold text-gray-900">Create a room</h3>
        <p class="mt-2 text-sm text-gray-600">Spin up a session as facilitator and get a shareable link instantly.</p>
      </div>
      <div class="text-center">
        <div class="mx-auto w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">2</div>
        <h3 class="mt-4 font-semibold text-gray-900">Invite your team</h3>
        <p class="mt-2 text-sm text-gray-600">Teammates join as voters or observers with one click — no signup required.</p>
      </div>
      <div class="text-center">
        <div class="mx-auto w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">3</div>
        <h3 class="mt-4 font-semibold text-gray-900">Add backlog items</h3>
        <p class="mt-2 text-sm text-gray-600">Load up the items you need estimated and step through them one at a time.</p>
      </div>
      <div class="text-center">
        <div class="mx-auto w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold text-lg">4</div>
        <h3 class="mt-4 font-semibold text-gray-900">Vote &amp; reveal</h3>
        <p class="mt-2 text-sm text-gray-600">Everyone votes anonymously, the facilitator reveals, and you finalize the estimate.</p>
      </div>
    </div>
  </div>
</section>

<section id="under-the-hood" class="max-w-7xl mx-auto px-4 py-20 md:py-28">
  <div class="max-w-2xl mx-auto text-center mb-16">
    <h2 class="text-3xl md:text-4xl font-bold text-gray-900">No servers in the middle</h2>
    <p class="mt-4 text-lg text-gray-600">Every room runs as its own peer-to-peer swarm, connected globally with no central database holding your data.</p>
  </div>
  <div class="grid gap-12">
    <figure>
      <img
        src="/assets/img/stock-global-network.png"
        alt="Global network illustrating distributed peer-to-peer connections across the world"
        class="rounded-2xl shadow-lg w-full h-auto object-cover"
        loading="lazy"
      />
      <figcaption class="mt-3 text-center text-sm text-gray-500">Teams anywhere in the world connect directly, peer-to-peer.</figcaption>
    </figure>
    <figure>
      <img
        src="/assets/img/diagram-client-data-flow.jpg"
        alt="Diagram of client-to-client and client-to-signaling-service data flow for connection bootstrap"
        class="rounded-2xl shadow-lg w-full h-auto object-contain bg-white"
        loading="lazy"
      />
      <figcaption class="mt-3 text-center text-sm text-gray-500">The signaling server only helps peers find each other — after that, votes sync directly between clients.</figcaption>
    </figure>
    <figure>
      <img
        src="/assets/img/diagram-swarm-topology.jpg"
        alt="Diagram of a swarm topology showing multiple clients meshed together in a planning poker room"
        class="rounded-2xl shadow-lg w-full h-auto object-contain bg-white"
        loading="lazy"
      />
      <figcaption class="mt-3 text-center text-sm text-gray-500">Each room forms its own isolated swarm, so your session data never mixes with another team's.</figcaption>
    </figure>
  </div>
</section>

<section class="max-w-7xl mx-auto px-4 py-20 md:py-28">
  <div class="rounded-3xl bg-gradient-to-br from-primary to-blue-600 px-8 py-16 md:px-16 md:py-20 text-center shadow-xl">
    <h2 class="text-3xl md:text-4xl font-extrabold text-white">Ready to run your next estimation session?</h2>
    <p class="mt-4 text-lg text-blue-100 max-w-xl mx-auto">
      Jump straight into the app and join your team's room in seconds. No signup required.
    </p>
    <div class="mt-8 flex flex-col sm:flex-row justify-center gap-4">
      <a
        href="/app/"
        class="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-lg font-semibold text-primary shadow-lg hover:bg-blue-50 transition-colors"
      >
        Join a Room
        <span aria-hidden="true">&rarr;</span>
      </a>
      <a
        href="/app/create-room"
        class="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 px-8 py-4 text-lg font-semibold text-white hover:bg-white/10 transition-colors"
      >
        Create a Room
      </a>
    </div>
  </div>
</section>
