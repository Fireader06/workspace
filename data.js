const jsonData = [
  {
    name: "StarterBall",
    description:
      "A simple, balanced orb that serves as the foundation for all others.",
    ability: "Bounce",
    gradient:
      "radial-gradient(circle at 30% 30%, hsl(220, 20%, 85%), hsl(220, 15%, 65%))",
    stats: {
      damage: 25,
      burn: false,
      freeze: false,
      shock: false,
      poison: false,
      slow: false,
      heal: false,
      knockback: 5,
      pierce: 1,
      areaEffect: false,
      duration: 2,
    },
  },
  {
    name: "TerraBall",
    description:
      "A dense orb of earth energy that shakes the ground upon impact.",
    ability: "Quake",
    gradient:
      "radial-gradient(circle at 30% 30%, hsl(35, 60%, 65%), hsl(25, 50%, 40%))",
    stats: {
      damage: 60,
      burn: false,
      freeze: false,
      shock: false,
      poison: false,
      slow: true,
      heal: false,
      knockback: 15,
      pierce: 0,
      areaEffect: true,
      duration: 3,
    },
  },
  {
    name: "AetherBall",
    description:
      "A radiant orb infused with celestial energy that restores and empowers allies.",
    ability: "Renew",
    gradient:
      "radial-gradient(circle at 30% 30%, hsl(280, 70%, 80%), hsl(320, 60%, 55%))",
    stats: {
      damage: 20,
      burn: false,
      freeze: false,
      shock: false,
      poison: false,
      slow: false,
      heal: true,
      knockback: 0,
      pierce: 0,
      areaEffect: true,
      duration: 10,
    },
  },
  {
    name: "GaleBall",
    description:
      "A swift orb of whirling air that knocks enemies back with fierce gusts.",
    ability: "Gust",
    gradient:
      "radial-gradient(circle at 30% 30%, hsl(190, 75%, 85%), hsl(210, 65%, 60%))",
    stats: {
      damage: 30,
      burn: false,
      freeze: false,
      shock: false,
      poison: false,
      slow: false,
      heal: false,
      knockback: 20,
      pierce: 1,
      areaEffect: false,
      duration: 4,
    },
  },
];
