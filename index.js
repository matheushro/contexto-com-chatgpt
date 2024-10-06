import puppeteer from "puppeteer";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();
let usedWords = [];
let errorWords = [];

(async () => {

    await page.goto('https://contexto.me');

    await page.waitForSelector('input[type="text"]');

    await page.click('input[type="text"]');

    for(let i = 0; i <= 50; i++)
    {
        if (await checkIfWonTheGame()) {
            break;
        }
        await sendWord();
    }

})();


async function sendWord() 
{
    const word = await generateNewWord();

    if (usedWords.some(wordObj => wordObj.word === word)) {
        console.log(`A palavra "${word}" já foi usada.`);
        return;
    }
    if(errorWords.includes(word)){
        console.log(`A palavra "${word}" não foi reconhecida.`);
        return;
    }


    try {
        await page.type('input[type="text"]', word);
        await page.keyboard.press('Enter');

        // Aguardar a palavra aparecer na rodada atual
        const response = await page.waitForFunction((word) => {
            const knowWord = Array.from(document.querySelectorAll('.guess-history .row-wrapper.current .row span'))
                .some(span => span.textContent.trim() === word);

            const errorMessage = Array.from(document.querySelectorAll('.message-text'))
                .some(div => div.textContent.trim() === 'Perdão, não conheço essa palavra' || div.textContent.trim() === 'Essa palavra não vale porque é muito comum');

            // Retorna apenas 'known', 'error' ou null
            return knowWord ? 'known' : (errorMessage ? 'error' : null);
        }, {}, word);


        const value = await response.jsonValue();

        // Verifica a resposta
        if (value !== 'known') {
            throw new Error('Palavra não reconhecida');
        }

        await saveCurrentWord();
    } catch (error) {
        await page.evaluate(() => {
            document.querySelector('input[type="text"]').value = '';
        });
        errorWords.push(word);
    }
}


async function saveCurrentWord() {
    //extracts the words from the current round
    const newWords = await page.evaluate(() => {
        const elementos = Array.from(document.querySelectorAll('.guess-history .row-wrapper .row'));
        return elementos.map(el => {
            const spans = el.querySelectorAll('span');
            return {
                word: spans[0].textContent.trim(), // saves the word
                number: spans[1]?.textContent?.trim() || '' // saves the value 
            };
        });
    });

    //saves the words that haven't been used yet
    newWords.forEach(newWord => {
        if (!usedWords.find(wordObj => wordObj.word === newWord.word)) {
            usedWords.push(newWord);
        }
    });

    console.log(usedWords);
}

async function generateNewWord()
{


    const sortedWords = usedWords.sort((a, b) => b.number - a.number);
    const jsonOutput = {
        usedWords: sortedWords,
        errorWords: errorWords
    };


    const completion = await openai.chat.completions.create({
        messages: [{ 
            role: "system", 
            content: `
                Sua resposta deve ser de apenas uma única palavra. Seja direto e assertivo. Me responda sem pontuação ou letras maiúsculas. Lembre-se de escrever corretamente com português claro e objetivo.Não repita palavras. Seja o mais eficiente possível para encontrar a palavra da forma mais rápida possível. Caso o esteja proximo do número 100, busque palavras com contexto semelhante. Caso esteja longe do número 50, busque palavras com contexto distinto e completamente diferentes até chegar em uma mais próxima. SEMPRE veja as palavras já testadas e suas respectivas posições e NÃO REPITA o contexto das anteriores caso o valor delas seja alto.
                SEMPRE veja as palavras já testadas e suas respectivas posições e NÃO REPITA o contexto das anteriores caso o valor delas seja alto. (Exemplo, se "Uva" estiver com número 200, não sugira "Fruta" ou "Alimento" pois já foram testadas e estão longe da palavra secreta).
                Palavras próximas que devem ser levadas em consideração tem pontuação acima de 50. Palavras distantes tem pontuação acima de 50.
                INSTRUÇÕES DO JOGO:
                A palavra secreta é a número 1 na lista de palavras testadas.
                Sugira apenas uma palavra por vez, sem pontuação ou letras maiúsculas.
                Após cada tentativa, você receberá informações sobre todas as palavras já testadas e suas respectivas posições.
                Não repita palavras já utilizadas.
                Tem um limite de 10 tentativas, então seja o mais eficiente possível para encontrar a palavra da forma mais rápida possível.
                O jogo se baseia no contexto das palavras, não na escrita.
                Leve em conta as palavras não reconhecidas (erros) e não sugira-as novamente.
                Quando a palavra testada estiver longe da palavra secreta (número acima de 50), busque palavras com contexto distinto e completamente diferentes até chegar em uma mais próxima.
                Me envie apenas uma palavra, não existem palavras compostas.
                LISTAS ATUAIS em formato JSON:
                verifique principalmente o number de usedWords para saber a posição das palavras testadas em relação à palavra secreta.
                ${JSON.stringify(jsonOutput, null, 2)}
            ` 
        }],
        model: "gpt-4o",
    });
    
    return(completion.choices[0]['message']['content']);
}

async function checkIfWonTheGame() {
    try {
        const response = await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll('.end-msg .bigger span'))
                .some(span => span.textContent.trim() === 'Parabéns!');
        }, { timeout: 1000 }); 

        const value = await response.jsonValue();

        if (value) {
            console.log('Você ganhou o jogo!');
            return true;
        }

        return false;
    } catch (error) {
        return false
    }
}