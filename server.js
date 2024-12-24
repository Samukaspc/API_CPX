const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const upload = multer();
const app = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function formatDate(dateStr) {
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
}
app.get('/', (req, res) => {
    res.send('API de bate-ponto rodando!');
});

app.post('/api/consulta-ponto', upload.none(), async (req, res) => {
    const { data_inicio, data_final, usuarios, guarnicao,registro_deletado } = req.body;

    function dateToMinutes(dateStr) {
        return new Promise((resolve, reject) => {
            try {
                const [day, month, year, hour, minute] = dateStr.split(/[\s/:]/);
                const date = new Date(year, month - 1, day, hour, minute);
                resolve(date.getTime() / 10000); 
            } catch (error) {
                reject(error);
            }
        });
    }

    async function getHorasUsuario(usuarioId) {
        try {
            const response = await axios.post(
                'https://policia.complexorjbrasil.com.br/php/banco.php?tab=bateponto&acao=relatorio_ponto_datas',
                new URLSearchParams({
                    tab: 'bateponto',
                    acao: 'relatorio_ponto_datas',
                    data_inicio: formatDate(data_inicio),
                    data_final: formatDate(data_final),
                    usuario: usuarioId, 
                    'guarnicao[]': guarnicao,
                    registro_deletado: registro_deletado || 0,
                }),
                {
                    headers: {
                        Cookie: 'PHPSESSID=723c15af95f87362437c33576809a4a4; sidenav-state=unpinned'
                    }
                }
            );

            const dataTeste = response.data;
            let totalMinutes = 0;

            if (dataTeste && dataTeste.dados && dataTeste.dados.length > 0) {
                const promises = dataTeste.dados.map(async (item) => {
                    const dt_inicio = item.dt_inicio;
                    const dt_final = item.dt_final;

                    try {
                        const startMinutes = await dateToMinutes(dt_inicio);
                        const endMinutes = await dateToMinutes(dt_final);

                        const durationMinutes = endMinutes - startMinutes;
                        totalMinutes += durationMinutes;
                    } catch (error) {
                        console.error('Erro ao calcular a duração para o ponto do usuário', usuarioId, error);
                    }
                });

                await Promise.all(promises);

                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;

                console.log(`Usuário ${usuarioId}: ${hours} horas e ${minutes} minutos.`);

                return { usuarioId, totalTempo: `${hours} horas e ${minutes} minutos` };
            } else {
                return { usuarioId, totalTempo: 'Nenhum dado encontrado' };
            }
        } catch (error) {
            console.error('Erro ao chamar a API de ponto para o usuário', usuarioId, error.message);
            return { usuarioId, totalTempo: 'Erro ao processar dados' };
        }
    }

    const resultados = [];

    for (const usuarioId of usuarios) {
        const resultado = await getHorasUsuario(usuarioId);
        resultados.push(resultado);
    }

    return res.json(resultados);
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
