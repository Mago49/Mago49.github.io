<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Calculadora de Frete</title>
  <script src="https://maps.googleapis.com/maps/api/js?key=SUA_CHAVE_API&libraries=places"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    input { margin: 5px; padding: 8px; width: 300px; }
    button { padding: 10px 20px; margin-top: 10px; }
    #resultado { margin-top: 20px; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Calculadora de Frete</h1>
  <label>Origem:</label><br>
  <input id="origem" type="text" placeholder="Digite o endereço de origem"><br>
  <label>Destino:</label><br>
  <input id="destino" type="text" placeholder="Digite o endereço de destino"><br>
  <button onclick="calcularFrete()">Calcular Frete</button>

  <div id="resultado"></div>

  <script>
    function calcularFrete() {
      const origem = document.getElementById("origem").value;
      const destino = document.getElementById("destino").value;

      const service = new google.maps.DistanceMatrixService();
      service.getDistanceMatrix({
        origins: [origem],
        destinations: [destino],
        travelMode: 'DRIVING',
        unitSystem: google.maps.UnitSystem.METRIC
      }, function(response, status) {
        if (status !== 'OK') {
          alert('Erro ao consultar: ' + status);
        } else {
          const distanciaTexto = response.rows[0].elements[0].distance.text;
          const distanciaKm = response.rows[0].elements[0].distance.value / 1000;

          // Fórmula de frete: taxa fixa + valor por km
          const taxaFixa = 5; // R$5
          const valorPorKm = 2; // R$2 por km
          const valorFrete = taxaFixa + (valorPorKm * distanciaKm);

          document.getElementById("resultado").innerHTML =
            `Distância: ${distanciaTexto}<br>Valor do frete: R$ ${valorFrete.toFixed(2)}`;
        }
      });
    }
  </script>
</body>
</html>