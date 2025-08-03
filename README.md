<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Projeto</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f5f5f5;
    }

    header.titulo-principal {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 1rem;
      background-color: #ffffff;
      flex-direction: row;
      gap: 1rem;
    }

    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: nowrap; /* impede quebra */
      gap: 1rem;
    }

    .logo {
      width: 160px;
      max-width: 100%;
      height: auto;
    }

    .gradient-title {
      font-size: 1.5rem;
      font-weight: bold;
      background: linear-gradient(to right, #0f0c29, #302b63, #24243e);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
      margin: 0;
    }

    @media (max-width: 640px) {
      .gradient-title {
        font-size: 1rem;
      }

      .logo {
        max-width: 120px;
      }

      header.titulo-principal {
        flex-direction: row;
        gap: 0.5rem;
        padding: 0.5rem;
      }
    }
  </style>
</head>
<body>
  <header class="titulo-principal">
    <div class="logo-container">
      <img src="logo.png" alt="Logo da empresa" class="logo" />
      <h1 class="gradient-title">Nome do Projeto</h1>
    </div>
  </header>
</body>
</html>