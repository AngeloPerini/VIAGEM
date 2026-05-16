import type { Attraction } from '../types';

export const ATTRACTION_STORAGE_KEY = 'europa-budget-attractions-v1';

export const attractions: Attraction[] = [
  { id: 'rome-coliseu', name: 'Coliseu', country: 'italy', city: 'Roma', day: 'Dia 17', time: '09h00', description: 'Visita ao anfiteatro romano mais iconico da viagem.' },
  { id: 'rome-forum-palatino', name: 'Forum Romano + Palatino', country: 'italy', city: 'Roma', day: 'Dia 17', time: '11h00', description: 'Percurso historico pelo Forum Romano e pelo monte Palatino.' },
  { id: 'rome-piazza-venezia', name: 'Piazza Venezia', country: 'italy', city: 'Roma', day: 'Dia 16', time: '20h30', description: 'Primeira parada noturna no centro monumental de Roma.' },
  { id: 'rome-fontana-trevi', name: 'Fontana di Trevi', country: 'italy', city: 'Roma', day: 'Dia 16 e Dia 17', description: 'Fonte barroca classica para visitar de noite e de dia.' },
  { id: 'rome-pantheon', name: 'Pantheon', country: 'italy', city: 'Roma', day: 'Dia 16 e Dia 17', description: 'Um dos pontos historicos mais marcantes do centro romano.' },
  { id: 'rome-piazza-navona', name: 'Piazza Navona', country: 'italy', city: 'Roma', day: 'Dia 16', time: '21h40', description: 'Praca historica com fontes, artistas e movimento noturno.' },
  { id: 'rome-via-corso', name: 'Via del Corso', country: 'italy', city: 'Roma', day: 'Dia 17', time: '15h30', description: 'Caminhada pela avenida comercial do centro de Roma.' },
  { id: 'rome-piazza-popolo', name: 'Piazza del Popolo', country: 'italy', city: 'Roma', day: 'Dia 17', time: '16h15', description: 'Praca ampla no eixo historico da cidade.' },
  { id: 'rome-sao-pedro', name: 'Basilica de Sao Pedro', country: 'italy', city: 'Roma', day: 'Dia 21', time: '16h00', description: 'Visita a Basilica de Sao Pedro na area do Vaticano.' },
  { id: 'rome-castel-angelo', name: "Castel Sant'Angelo", country: 'italy', city: 'Roma', day: 'Dia 21', time: '17h30', description: 'Castelo historico as margens do Tibre.' },
  { id: 'rome-ponte-angelo', name: "Ponte Sant'Angelo", country: 'italy', city: 'Roma', day: 'Dia 21', time: '18h15', description: 'Ponte cenica no caminho de volta para Trastevere.' },
  { id: 'rome-piazza-trilussa', name: 'Piazza Trilussa', country: 'italy', city: 'Roma', day: 'Dia 21', time: '19h30', description: 'Ponto de encontro para comecar a noite em Trastevere.' },
  { id: 'rome-santa-maria-trastevere', name: 'Piazza Santa Maria in Trastevere', country: 'italy', city: 'Roma', day: 'Dia 21', time: '22h00', description: 'Fechamento do roteiro em uma das pracas mais bonitas do bairro.' },
  { id: 'milan-duomo', name: 'Duomo di Milano', country: 'italy', city: 'Milao', day: 'Dia 19', time: '09h40', description: 'Catedral simbolo de Milao, visita rapida antes do voo.' },
  { id: 'milan-galleria', name: 'Galleria Vittorio Emanuele II', country: 'italy', city: 'Milao', day: 'Dia 19', time: '10h10', description: 'Galeria historica ao lado do Duomo.' },

  { id: 'stmoritz-lago', name: 'Lago St. Moritz', country: 'switzerland', city: 'St. Moritz', day: 'Dia 18', time: '12h30', description: 'Parada principal para fotos e caminhada na chegada.' },
  { id: 'stmoritz-centro', name: 'Centro historico de St. Moritz', country: 'switzerland', city: 'St. Moritz', day: 'Dia 18', time: '14h00', description: 'Passeio pelo centro elegante e historico da cidade.' },
  { id: 'stmoritz-caminhada-lago', name: 'Caminhada na beira do lago', country: 'switzerland', city: 'St. Moritz', day: 'Dia 18', time: '15h00', description: 'Tempo livre para caminhar ao redor do lago.' },
  { id: 'bernina-panoramico', name: 'Bernina / Trecho panoramico', country: 'switzerland', city: 'Bernina', day: 'Dia 18', time: '09h30-12h30', description: 'Trecho panoramico entre Tirano e St. Moritz.' },

  { id: 'paris-passerelle-debilly', name: 'Passerelle Debilly', country: 'france', city: 'Paris', day: 'Dia 19', time: '16h15', description: 'Ponte com vista bonita para a Torre Eiffel.' },
  { id: 'paris-torre-eiffel', name: 'Torre Eiffel', country: 'france', city: 'Paris', day: 'Dia 19', time: '16h50', description: 'Principal marco visual de Paris no fim da tarde.' },
  { id: 'paris-sena-barco', name: 'Rio Sena / Passeio de barco', country: 'france', city: 'Paris', day: 'Dia 19', time: '18h10', description: 'Passeio pelo Sena para ver Paris a partir do rio.' },
  { id: 'paris-champs-elysees', name: 'Champs-Elysees', country: 'france', city: 'Paris', day: 'Dia 19', time: '19h30', description: 'Caminhada pela avenida mais conhecida de Paris.' },
  { id: 'paris-arco-triunfo', name: 'Arco do Triunfo', country: 'france', city: 'Paris', day: 'Dia 19', time: '20h15', description: 'Parada no monumento no eixo da Champs-Elysees.' },
  { id: 'paris-estrapade', name: "Place de l'Estrapade", country: 'france', city: 'Paris', day: 'Dia 20', time: '08h00', description: 'Parada matinal no Quartier Latin.' },
  { id: 'paris-fosses', name: '16 Rue des Fosses Saint-Jacques', country: 'france', city: 'Paris', day: 'Dia 20', time: '08h20', description: 'Endereco do roteiro pelo Quartier Latin.' },
  { id: 'paris-luxemburgo', name: 'Jardim de Luxemburgo', country: 'france', city: 'Paris', day: 'Dia 20', time: '08h40', description: 'Caminhada curta pelo jardim antes do Louvre.' },
  { id: 'paris-louvre', name: 'Museu do Louvre', country: 'france', city: 'Paris', day: 'Dia 20', time: '09h00-11h00', description: 'Visita ao museu mais importante do roteiro de Paris.' },
  { id: 'paris-galerie-patrick', name: 'Galerie Patrick Fourtin', country: 'france', city: 'Paris', day: 'Dia 20', time: '11h10', description: 'Parada cultural apos o Louvre.' },
  { id: 'paris-tuileries', name: 'Jardin des Tuileries', country: 'france', city: 'Paris', day: 'Dia 20', time: '11h40', description: 'Jardim classico entre o Louvre e a Concorde.' },
  { id: 'paris-concorde', name: 'Place de la Concorde', country: 'france', city: 'Paris', day: 'Dia 20', time: '12h10', description: 'Praca monumental no eixo historico de Paris.' },
  { id: 'paris-lafayette', name: 'Galeries Lafayette Haussmann', country: 'france', city: 'Paris', day: 'Dia 20', time: '13h00', description: 'Parada no centro comercial e arquitetonico da cidade.' },
  { id: 'paris-parc-princes', name: 'Parc des Princes / Tour do PSG', country: 'france', city: 'Paris', day: 'Dia 20', time: '16h30', description: 'Visita ao estadio do PSG.' },
];
