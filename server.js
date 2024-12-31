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

async function fetchData() {
    const url = 'https://policia.complexorjbrasil.com.br/php/banco.php?tab=bateponto&acao=lista_usuarios';
    const headers = {
        Cookie: 'PHPSESSID=723c15af95f87362437c33576809a4a4; sidenav-state=unpinned'
    };

    try {
        const response = await axios.get(url, { headers });
        return response.data; 
    } catch (error) {
        console.error('Erro ao buscar dados:', error.message);
        throw new Error('Não foi possível buscar os dados.');
    }
}

app.get('/api/data', async (_, res) => {
    try {
        const data = await fetchData();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/consulta-ponto', upload.none(), async (req, res) => {
    const { data_inicio, data_final, usuarios, guarnicao, registro_deletado } = req.body;
    console.log('guarnicao:', guarnicao);

    const guarnicoes = {
        1: 'PMERJ',
        2: 'BPM',
        3: 'GAM',
        4: 'PATAMO',
        6: 'BOPE',
        7: 'CHOQUE',
        8: 'CURSOS',
        9: 'REUNIAO',
        10: 'INTRUÇÃO',
        11: 'COMANDO',
        12: 'AGUARDNADO PTR',
        14: 'INCRUSÃO',
        21: 'COE'
    };

    function dateToMinutes(dateStr) {
        return new Promise((resolve, reject) => {
            try {
                const [day, month, year, hour, minute, second] = dateStr.split(/[\s/:]/);
                const date = new Date(year, month - 1, day, hour, minute, second);
                const minutes = date.getHours() * 60 + date.getMinutes();
                resolve(minutes); 
            } catch (error) {
                reject(error);
            }
        });
    }

    async function getHorasUsuario(usuarioId, guarnicaoId) {
        try {
            const response = await axios.post(
                'https://policia.complexorjbrasil.com.br/php/banco.php?tab=bateponto&acao=relatorio_ponto_datas',
                new URLSearchParams({
                    tab: 'bateponto',
                    acao: 'relatorio_ponto_datas',
                    data_inicio: formatDate(data_inicio),
                    data_final: formatDate(data_final),
                    usuario: usuarioId, 
                    'guarnicao[]': guarnicaoId, 
                    registro_deletado: registro_deletado || 0,
                }),
                {
                    headers: {
                        Cookie: 'PHPSESSID=723c15af95f87362437c33576809a4a4; sidenav-state=unpinned'
                    }
                }
            );

            const data = response.data;
            let totalMinutes = 0;
            let nomeUsuario = '';

            if (data && data.dados && data.dados.length > 0) {
                const promises = data.dados.map(async (item) => {
                    const dt_inicio = item.dt_inicio;
                    const dt_final = item.dt_final;

                    try {
                        const startMinutes = await dateToMinutes(dt_inicio);
                        const endMinutes = await dateToMinutes(dt_final);

                        const durationMinutes = endMinutes - startMinutes;
                        totalMinutes += durationMinutes;
                        nomeUsuario = item.nome_usuario;
                    } catch (error) {
                        console.error('Erro ao calcular a duração para o ponto do usuário', usuarioId, nomeUsuario, error);
                    }
                });

                await Promise.all(promises);

                const hours = Math.floor(totalMinutes / 60);
                const minutes = totalMinutes % 60;


                return { 
                    usuarioId, 
                    nomeUsuario, 
                    guarnicaoNome: guarnicoes[guarnicaoId] || 'Guarnição Desconhecida',  
                    guarnicaoId,
                    totalTempo: `${hours} horas e ${minutes} minutos` 
                };
            } else {
                return { 
                    usuarioId, 
                    nomeUsuario, 
                    guarnicaoNome: guarnicoes[guarnicaoId] || 'Guarnição Desconhecida',
                    guarnicaoId,
                    totalTempo: 'Nenhum dado encontrado' 
                };
            }
        } catch (error) {
            console.error('Erro ao chamar a API de ponto para o usuário', usuarioId, error.message);
            return { 
                usuarioId, 
                nomeUsuario: '', 
                guarnicaoNome: guarnicoes[guarnicaoId] || 'Guarnição Desconhecida', 
                guarnicaoId,
                totalTempo: 'Erro ao processar dados' 
            };
        }
    }

    const resultados = [];

    for (const usuarioId of usuarios) {
        for (const guarnicaoId of guarnicao) {
            const resultado = await getHorasUsuario(usuarioId, guarnicaoId);
            resultados.push(resultado);
        }
    }

    return res.json(resultados);
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Servidor rodando`);
});
