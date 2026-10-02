/**
 * Free photo tagging that runs inside the browser: a small CLIP model compares each photo with a list of
 * scenes and picks the closest ones. No API, no cost; the model (~90 MB) downloads once and stays cached.
 */

interface Concept {
  /** What CLIP compares the photo with (it understands English). */
  prompt: string;
  /** Tags saved on the photo, in Portuguese, including the themes the scene can illustrate. */
  tags: string[];
}

const CONCEPTS: Concept[] = [
  { prompt: 'a cup of coffee', tags: ['café', 'xícara', 'manhã'] },
  { prompt: 'a person working on a laptop', tags: ['notebook', 'trabalho', 'foco', 'produtividade'] },
  { prompt: 'a desk with a planner and a pen', tags: ['planejamento', 'organização', 'caderno', 'metas'] },
  { prompt: 'someone writing in a journal', tags: ['diário', 'escrita', 'reflexão', 'caderno'] },
  { prompt: 'a person reading a book', tags: ['livro', 'leitura', 'estudo'] },
  { prompt: 'a cozy bed in a bedroom', tags: ['cama', 'quarto', 'descanso', 'sono'] },
  { prompt: 'a woman', tags: ['mulher'] },
  { prompt: 'a man', tags: ['homem'] },
  { prompt: 'a group of friends', tags: ['amigos', 'conexão'] },
  { prompt: 'a couple in love', tags: ['casal', 'amor'] },
  { prompt: 'a family with children', tags: ['família', 'criança'] },
  { prompt: 'people working out at the gym', tags: ['academia', 'treino', 'exercício', 'saúde', 'disciplina'] },
  { prompt: 'a person running outdoors', tags: ['corrida', 'exercício', 'saúde', 'constância'] },
  { prompt: 'a person doing yoga or meditating', tags: ['yoga', 'meditação', 'calma', 'autocuidado'] },
  { prompt: 'a healthy meal with vegetables', tags: ['comida saudável', 'alimentação', 'saúde'] },
  { prompt: 'cooking in a kitchen', tags: ['cozinha', 'comida', 'casa'] },
  { prompt: 'a glass of water', tags: ['água', 'hidratação', 'saúde'] },
  { prompt: 'a beach and the sea', tags: ['praia', 'mar', 'férias', 'verão'] },
  { prompt: 'a swimming pool', tags: ['piscina', 'verão', 'férias'] },
  { prompt: 'mountains and nature', tags: ['natureza', 'montanha', 'liberdade'] },
  { prompt: 'a green forest', tags: ['natureza', 'floresta', 'verde', 'calma'] },
  { prompt: 'a city street', tags: ['cidade', 'rua'] },
  { prompt: 'city lights at night', tags: ['noite', 'cidade'] },
  { prompt: 'a sunrise with soft morning light', tags: ['manhã', 'nascer do sol', 'recomeço'] },
  { prompt: 'a sunset', tags: ['pôr do sol', 'fim de dia', 'reflexão'] },
  { prompt: 'rain on a window', tags: ['chuva', 'calma', 'introspecção'] },
  { prompt: 'indoor plants', tags: ['plantas', 'casa', 'verde'] },
  { prompt: 'a cozy living room', tags: ['casa', 'aconchegante', 'sala'] },
  { prompt: 'a minimalist beige interior', tags: ['minimalista', 'estética', 'casa', 'organização'] },
  { prompt: 'skincare products in a bathroom', tags: ['skincare', 'autocuidado', 'beleza'] },
  { prompt: 'makeup and cosmetics', tags: ['maquiagem', 'beleza'] },
  { prompt: 'a fashion outfit', tags: ['moda', 'look', 'estilo'] },
  { prompt: 'shopping bags', tags: ['compras', 'moda'] },
  { prompt: 'money and bills', tags: ['dinheiro', 'finanças'] },
  { prompt: 'a hand holding a smartphone', tags: ['celular', 'redes sociais', 'distração'] },
  { prompt: 'a calendar on a wall', tags: ['calendário', 'rotina', 'planejamento'] },
  { prompt: 'a clock', tags: ['relógio', 'tempo', 'rotina'] },
  { prompt: 'stairs going up', tags: ['escada', 'progresso', 'evolução', 'subir'] },
  { prompt: 'an empty road ahead', tags: ['caminho', 'jornada', 'futuro'] },
  { prompt: 'a modern office', tags: ['escritório', 'trabalho', 'carreira'] },
  { prompt: 'a car', tags: ['carro'] },
  { prompt: 'a bicycle', tags: ['bicicleta', 'pedalar', 'movimento'] },
  { prompt: 'a dog', tags: ['cachorro', 'pet'] },
  { prompt: 'a cat', tags: ['gato', 'pet'] },
  { prompt: 'flowers', tags: ['flores', 'delicadeza'] },
  { prompt: 'a mirror selfie', tags: ['espelho', 'selfie', 'autoestima'] },
  { prompt: 'a happy smiling person', tags: ['felicidade', 'sorriso', 'leveza'] },
  { prompt: 'a tired person', tags: ['cansaço', 'exaustão', 'pausa'] },
  { prompt: 'a sad person alone', tags: ['tristeza', 'solidão', 'dia ruim'] },
  { prompt: 'headphones and music', tags: ['música', 'foco'] },
  { prompt: 'a suitcase and travel', tags: ['viagem', 'aventura'] },
  { prompt: 'a bible or a church', tags: ['fé', 'espiritualidade'] },
  { prompt: 'modern architecture', tags: ['arquitetura', 'cidade'] },
  { prompt: 'a dark moody photo', tags: ['escuro', 'intenso'] },
  { prompt: 'a bright clean white photo', tags: ['claro', 'clean', 'leveza'] },
];

const MODEL = 'Xenova/clip-vit-base-patch32';
const MAX_CONCEPTS = 4;
const MIN_SCORE = 0.06;

type Classifier = (image: string, labels: string[]) => Promise<{ label: string; score: number }[]>;

let classifier: Promise<Classifier> | null = null;
let ready = false;

async function loadClassifier(): Promise<Classifier> {
  const { pipeline } = await import('@huggingface/transformers');
  const run = await pipeline('zero-shot-image-classification', MODEL, { dtype: 'q8' });
  ready = true;
  return async (image, labels) => (await run(image, labels)) as { label: string; score: number }[];
}

function getClassifier(): Promise<Classifier> {
  if (!classifier) {
    classifier = loadClassifier();
    classifier.catch(() => {
      classifier = null;
    });
  }
  return classifier;
}

/** True once the model has been downloaded and loaded in this session. */
export function isLocalVisionReady(): boolean {
  return ready;
}

/** Tags for a photo given as a URL (object URL or data URL). */
export async function tagWithLocalVision(imageUrl: string): Promise<string[]> {
  const classify = await getClassifier();
  const results = await classify(
    imageUrl,
    CONCEPTS.map((concept) => concept.prompt),
  );
  const chosen = results.filter((result) => result.score >= MIN_SCORE).slice(0, MAX_CONCEPTS);
  const tags = chosen.flatMap((result) => CONCEPTS.find((concept) => concept.prompt === result.label)?.tags ?? []);
  return [...new Set(tags)];
}
