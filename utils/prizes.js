// جدول الجوائز الخاص بعجلة الحظ (عادية / سوبر)
const prizes = {
  normal: [
     { prize: '1 rob', chance: 50 },

    { prize: '2 rob', chance: 20 },
    { prize: '1 rob', chance: 1 },
    { prize: '1 rob', chance: 0.1 },
    { prize: '1 rob', chance: 0.00001 },
  ],
  super: [
    { prize: '5 rob', chance: 50 },
    { prize: '5 rob', chance: 30 },
    { prize: '10 rob', chance: 7 },
    { prize: '10 rob', chance: 0.000000001 },
    { prize: '10 rob', chance: 0.000000001 },
    { prize: '10rob', chance: 0.00001 },
    { prize: '10 rob', chance: 0.00001 },
    { prize: '10 rob', chance: 0.00001 },
  ]
};

function getRandomPrize(type) {
  const list = prizes[type];
  const total = list.reduce((sum, item) => sum + item.chance, 0);
  const random = Math.random() * total;
  let cumulative = 0;
  for (const item of list) {
    cumulative += item.chance;
    if (random <= cumulative) return item.prize;
  }
  return list[list.length - 1].prize;
}

module.exports = { prizes, getRandomPrize };
