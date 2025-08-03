<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sua Opinião é Fundamental!</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            font-family: 'Poppins', sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            color: #333;
            position: relative;
            overflow: hidden;
            background-color: white; /* remoção do bege, fundo branco */
        }
        
        .background-svg {
            position: absolute;
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
            width: 100%;
            box-sizing: border-box;
            transform: scale(1);
            transition: all 0.3s ease;
            color: #333;
        }

        .container:hover {
            transform: translateY(-5px) scale(1.01);
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

        @media (min-width: 640px) {
            h1 {
                font-size: 3rem;
            }
        }
        
        p {
            color: #555;
            margin-bottom: 0.5rem;
            font-size: 1rem;
        }

        @media (min-width: 640px) {
            p {
                font-size: 1.125rem;
            }
        }

        .footer {
            color: #777;
        }

        .logo-container {
            margin-bottom: 1.5rem;
        }

        .logo {
            max-width: 150px;
            height: auto;
        }
    </style>
</head>
<body class="p-4 sm:p-5">
    <svg class="background-svg" viewBox="0 0 1440 800" xmlns="http://www.w3.org/2000/svg">
        <rect width="1440" height="800" fill="white"/>

        <!-- Azul: canto superior esquerdo -->
        <path d="M 0 0 A 400 400 0 0 1 400 400 L 0 400 Z" fill="#1e3a8a"/>

        <!-- Vermelho: canto superior direito -->
        <path d="M 1440 0 A 400 400 0 0 0 1040 400 L 1440 400 Z" fill="#ef4444"/>

        <!-- Amarelo: canto inferior esquerdo -->
        <path d="M 0 800 A 400 400 0 0 0 400 400 L 0 400 Z" fill="#facc15"/>

        <!-- Verde: canto inferior direito -->
        <path d="M 1440 800 A 400 400 0 0 1 1040 400 L 1440 400 Z" fill="#15803d"/>
    </svg>
    
    <div class="container mx-auto relative z-10">
        <div class="logo-container">
            <img src="1000000209.jpg" alt="Logo PAFCS Data Solutions" class="logo">
        </div>
        <h1 class="text-3xl sm:text-4xl">Sua Opinião é Fundamental!</h1>
        <p class="mt-4 text-lg">Olá, lojista!</p>
        <p class="text-lg">Queremos construir a melhor solução de automação para o seu negócio e a sua participação é essencial nesse processo.</p>
        <p class="text-lg">Suas experiências e desafios nos ajudarão a criar algo realmente útil e alinhado com as suas necessidades diárias.</p>
        <p class="mt-8 mb-8 text-xl font-semibold">Para compartilhar suas ideias e nos ajudar a moldar o futuro da nossa solução, clique no botão abaixo:</p>
        <a href="https://forms.gle/PCSt1SDPBA7DuQK57" class="cta-button">Compartilhe sua Opinião</a>
        <p class="footer mt-8 text-sm">Agradecemos imensamente sua colaboração!</p>
    </div>
</body>
</html>