<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sua Opinião é Fundamental!</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    html, body {
      height: auto;
      min-height: 100vh;
      overflow-x: hidden;
      overflow-y: auto;
      font-family: 'Poppins', sans-serif;
      margin: 0;
      padding: 0;
      background-color: white;
    }

    .background-svg {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
    }

    .container {
      background-color: rgba(255, 255, 255, 0.95);
      padding: 2rem 1.5rem;
      border-radius: 1.5rem;
      box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1);
      text-align: center;
      max-width: 600px;
      margin: 4rem auto 2rem auto;
      box-sizing: border-box;
      transition: all 0.3s ease;
      position: relative;
      z-index: 10;
    }

    .container:hover {
      transform: translateY(-3px) scale(1.01);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    }

    .cta-button {
      display: inline-block;
      padding: 1rem 2.5rem;
      background-image: linear-gradient(45deg, #1e3a8a, #15803d);
      color: #fff;
      text-decoration: none;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 1.2em;
      transition: all 0.3s ease;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.15);
    }

    .cta-button:hover {
      background-image: linear-gradient(45deg, #172e71, #116930);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    }

    h1 {
      color: #1e3a8a;
      margin-bottom: 0.5rem;
      font-weight: 700;
      font-size: 2.2rem;
    }

    p {
      color: #555;
      margin-bottom: 0.5rem;
      font-size: 1rem;
    }

    .footer {
      color: #777;
    }

    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .logo {
      max-width: 150px;
      height: auto;
    }

    .gradient-title {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(90deg, #1e3a8a, #15803d, #facc15, #ef4444);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
      text-shadow: 0px 0px 4px rgba(255,255,255,0.8);
    }

    .pulse-icon {
      animation: pulseMove 3s ease-in-out infinite;
    }

    @keyframes pulseMove {
      0% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(1.1); opacity: 1; }
      100% { transform: scale(1); opacity: 0.9; }
    }

    @keyframes pulseSVG {
      0% { transform: scale(1) translate(0, 0); opacity: 0.95; }
      50% { transform: scale(1.05) translate(10px, -10px); opacity: 1; }
      100% { transform: scale(1) translate(0, 0); opacity: 0.95; }
    }

    .pulse {
      animation: pulseSVG 6s ease-in-out infinite alternate;
    }

    .pulse-delay {
      animation-delay: 3s;
    }

    @media (min-width: 640px) {
      h1 { font-size: 3rem; }
      p { font-size: 1.125rem; }
    }

    @media (max-width: 640px) {
      .gradient-title { font-size: 1rem; }
      .logo { max-width: 120px; }
    }
  </style>
</head>
<body class="relative">
  <svg class="background-svg" viewBox="0 0 1440 800" xmlns="http://www.w3.org/2000/svg">
    <rect width="1440" height="800" fill="white"/>
    <circle cx="0" cy="0" r="280" fill="#1e3a8a" class="pulse"/>
    <circle cx="1440" cy="0" r="280" fill="#ef4444" class="pulse pulse-delay"/>
    <circle cx="0" cy="800" r="280" fill="#facc15" class="pulse pulse-delay"/>
    <circle cx="1440" cy="800" r="280" fill="#15803d" class="pulse"/>
  </svg>

  <div class="container">
    <div class="logo-container">
      <img src="Logo.jpeg" alt="Logo PAFCS Data Solutions" class="logo" />
      <div class="flex items-center gap-2">
        <span class="gradient-title">IA para Todos!</span>
        <svg class="pulse-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="32" height="32">
          <circle cx="24" cy="24" r="10" fill="#1e3a8a"/>
          <path d="M12 12 C18 18, 30 18, 36 12" stroke="#15803d" stroke-width="2" fill="none"/>
          <path d="M12 36 C18 30, 30 30, 36 36" stroke="#facc15" stroke-width="2" fill="none"/>
          <circle cx="24" cy="24" r="3" fill="#ef4444"/>
        </svg>
      </div>
    </div>

    <h1>Sua Opinião é Fundamental!</h1>
    <p class="mt-4 text-lg">Olá, lojista!</p>
    <p class="text-lg">Queremos construir a melhor solução de automação para o seu negócio e a sua participação é essencial nesse processo.</p>
    <p class="text-lg">Suas experiências e desafios nos ajudarão a criar algo realmente útil e alinhado com as suas necessidades diárias.</p>
    <p class="mt-8 mb-8 text-xl font-semibold">Para compartilhar suas ideias e nos ajudar a moldar o futuro da nossa solução, clique no botão abaixo:</p>
    <a href="https://forms.gle/PCSt1SDPBA7DuQK57" class="cta-button">Compartilhe sua Opinião</a>
    <p class="footer mt-8 text-sm">Agradecemos imensamente sua colaboração!</p>

    <!-- Redes sociais -->
    <div class="mt-10 text-center">
      <h2 class="text-lg font-semibold mb-4 text-gray-700">Vamos continuar conectados</h2>
      <div class="flex flex-col sm:flex-row justify-center items-center gap-4">
        <a href="https://www.instagram.com/pafcsdatasolutions" target="_blank"
           class="cta-button bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700">
          Instagram: @pafcsdatasolutions
        </a>
        <a href="https://wa.me/message/Q6WEGQK3HVJ7N1" target="_blank"
           class="cta-button bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700">
          WhatsApp: (31) 99596-1304
        </a>
      </div>
    </div>
  </div>
</body>
</html