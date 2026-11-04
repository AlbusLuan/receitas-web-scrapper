# Receitas Web Scrapper

O **Receitas Web Scrapper** foi desenvolvido a partir da necessidade de se ter o conteúdo do site de receitas [*Tudo Gostoso*](https://www.tudogostoso.com.br/) disponível em uma API para uso em outros projetos.

Atualmente é possível pesquisar e visualizar receitas.

## Como rodar

Requer Node.js 22 ou superior (Render configurado para Node.js 24). Não exige API Key.

```sh
npm ci
npm test
npm start
```

Produção executa `node index.js`. Para desenvolvimento com reinicialização automática, use `npm run dev`.
O Express escuta em `0.0.0.0`, na porta `process.env.PORT || 3000`.

## Hospedagem gratuita no Render

1. Faça merge do PR em `main` e conecte este repositório ao Render.
2. Crie um **Blueprint** selecionando o repositório e a branch `main`. O arquivo `render.yaml` cria um Web Service Node.js no plano `free`.
3. Alternativamente, crie um Web Service manual: build `npm ci --omit=dev`, start `npm start`, health check `/health`, Node.js 24 e `NODE_ENV=production`.
4. Use a URL HTTPS fornecida pelo Render, como `https://<seu-servico>.onrender.com`. O Render define `PORT`; não fixe essa variável no painel.

O plano gratuito pode suspender o serviço por inatividade. A primeira chamada após a suspensão pode demorar e ultrapassar o tempo de espera de um assistente de voz. Consulte as cotas e condições atuais do Render.
`/health` confirma que a aplicação está ativa, sem depender de uma chamada ao TudoGostoso.

## Como testar os endpoints

```sh
BASE_URL=http://localhost:3000
# Para testar no Render, substitua pelo endereço HTTPS publicado.
curl -i "$BASE_URL/health"
curl -i "$BASE_URL/search/bolo%20de%20cenoura"
# Use um id retornado pela busca:
curl -i "$BASE_URL/recipe/23-bolo-de-cenoura"
curl -i "$BASE_URL/search/zzzxxyyqqnaoexiste123456"
curl -i "$BASE_URL/recipe/999999999999-inexistente"
```

`GET /health` retorna HTTP 200 com `{"status":"ok"}`. Os endpoints de busca e receita mantêm seus formatos de sucesso abaixo.
Erros retornam `{"error":"descrição"}`: 400 para busca sem resultados ou parâmetros inválidos,
404 para receita não encontrada pelo site, 502 para falha HTTP/rede ou HTML não reconhecido,
504 para timeout (15 segundos) e 500 para exceção inesperada. A busca retorna no máximo dez receitas;
não ter dez resultados não é um erro. Falhas não geram receitas fictícias.

## URL no Echo Home

Na configuração da integração de receitas do seu projeto Echo Home, substitua a URL base anterior
pela URL HTTPS pública do Render, sem acrescentar `/health`, `/search` ou `/recipe`.
Mantenha as chamadas `GET <URL_BASE>/search/<nome codificado com encodeURIComponent>` e
`GET <URL_BASE>/recipe/<id retornado pela busca>`. Teste `/health` e uma busca antes de usar a voz.
Não configure API Key. Este repositório não contém o código nem a interface de configuração do Echo Home;
o nome exato do campo ou variável deve ser consultado nesse projeto. Se estiver usando uma skill Alexa,
esta API fornece dados HTTP e precisa ser chamada pelo backend da skill; sua URL não implementa diretamente o protocolo de uma skill.

## Variáveis de ambiente

```python
PORT = 3000 # se não estiver definida, considera o valor 3000
```

## Testes de integração

`npm test` executa testes HTTP locais, de tratamento de falhas e do parser.
Os HTMLs em `test/fixtures` são recortes de páginas reais obtidas em 04/11/2026,
sem imagens e SVGs; os testes não acessam a internet.

Nessa data, foram verificadas a busca por `bolo`, uma busca sem resultados, as receitas
`23-bolo-de-cenoura` e `119737-bolo-de-banana-rapido-de-liquidificador`, e uma receita inexistente (HTTP 404).
Os seletores antigos `.recipe-card`, `.ingredients-card` e `.instructions` não apareceram
nessas páginas. O scraper agora reconhece `.news-card-listing a.news-card-link`,
`.recipe-ingredients-item-label` e `.recipe-steps-item`, preservando o suporte ao HTML antigo.
Seções de ingredientes, passos e informações adicionais são mantidas. Favoritos só são retornados
quando presentes no HTML reconhecido; não são estimados. Alterações futuras do site ou bloqueios
podem causar erro 502 e exigem nova inspeção.

Validação de ponta a ponta local realizada com `npm start`: `/health` (200),
`/search/bolo` (200, dez receitas), `/recipe/23-bolo-de-cenoura` (200),
busca sem resultados (400) e receita inexistente (404). Deploy no Render e integração
no Echo Home não foram executados neste ambiente.

## Referência da API

### `GET search/:title`  
Busca uma lista de receitas que contenha, o valor de `:title` no título.

#### Parâmetros
- **title**: título da receita ou parte dele *[obrigatório]*

#### Retorno

`HTTP 200`: Um array contendo as receitas encontradas para o título informado. Cada receita contém os campos:

- **id**: identificador único da receita
- **title**: título da receita

`HTTP 400`: Um objeto com a propriedade `erro` contendo a descrição do erro.

#### Exemplo de resposta

```JSON
[
  {
    "title": "Bolo de aveia com cacau no micro-ondas",
    "id": "307527-bolo-de-aveia-com-cacau-no-micro-ondas"
  },
  {
    "title": "Bolo de doido",
    "id": "179005-bolo-de-doido"
  },
  {
    "title": "Bolo xadrez com brigadeiro",
    "id": "300777-bolo-xadrez-com-brigadeiro"
  }
]
```

### `GET recipe/:id`

Busca uma receita através de seu identificador único.

#### Parâmetros
- **id**: identificador único da receita obtido através da chamada do endpoint de busca *[obrigatório]*

#### Retorno

`HTTP 200`: Um objeto contendo as seguintes propriedades:

- **title**: título da receita
- **stats**: estatísticas da receita com os seguintes campos
    - **prepare_time_minutes**: tempo de preparação, em minutos
    - **portion_output**: quantidade de porções que a receita rende
    - **favorites**: quantas pessoas favoritaram a receita
- **ingredients**: lista de ingredientes
    - **title**: título da parte da receita (massa, cobertura, etc). Quando a receita não tiver seções, é retornada apenas uma seção com esse campo preenchido com *default*
    - **items**: array com a descrição dos ingredientes
- **instructions**: 
    - **title**: título da parte da receita
    - **items**: array com os passos das instruções

`HTTP 400`: Um objeto com a propriedade `erro` contendo a descrição do erro.

#### Exemplo de resposta

```json
{
  "title": "Picanha invertida",
  "stats": {
    "prepare_time_minutes": 90,
    "portion_output": 5,
    "favorites": 7933
  },
  "ingredients": [
    {
      "title": "default",
      "items": [
        "1 picanha de cerca de 1,5 kg",
        "400 g de provolone",
        "100 g de bacon",
        "Orégano",
        "Sal grosso"
      ]
    }
  ],
  "instructions": [
    {
      "title": "default",
      "items": [
        "Fure a picanha no sentido diagonal, deixando 1,5 cm nas laterais.",
        "Vire a ponta para dentro, deixando no avesso, cuidado no corte para não atravessar as laterais de um lado ao outro.",
        "Recheie com o provolone picado temperado com orégano e o bacon, também picado.",
        "Feche as aberturas com palitos.",
        "Salgue com o sal grosso.",
        "Coloque no forno a 200ºC em uma assadeira untada ou se preferir leve para churrasqueira.",
        "Deixe assar a seu gosto, virando de 15 em 15 minutos."
      ]
    }
  ]
}
```
