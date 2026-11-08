// Hand-written reading and science content. Every word is meant to be at about a 1st-grade level.
// level: 1 = start of the game (about mid-Iron Age), 2 = a little harder, 3 = harder still.

export interface MCItem {
  level: number;
  q: string;
  choices: string[]; // first choice is the correct one; shuffled at runtime
  why: string;
  passage?: string;
}

export const PASSAGES: MCItem[] = [
  { level: 1, passage: 'Tom has a red hat. He wears it to the park.', q: "What color is Tom's hat?", choices: ['red', 'blue', 'green'], why: 'The story says "Tom has a red hat."' },
  { level: 1, passage: 'The cat sat on a mat. Then the cat took a nap.', q: 'What did the cat do after it sat?', choices: ['It took a nap.', 'It ate a fish.', 'It ran away.'], why: 'The story says "Then the cat took a nap."' },
  { level: 1, passage: 'Mia has a big dog named Max. Max likes to dig in the sand.', q: 'What does Max like to do?', choices: ['dig in the sand', 'swim in the pond', 'sleep in a box'], why: 'The story says Max likes to dig in the sand.' },
  { level: 1, passage: 'Ben and his dad went to the pond. They saw three ducks swim by.', q: 'How many ducks did they see?', choices: ['three', 'two', 'five'], why: 'The story says "They saw three ducks."' },
  { level: 1, passage: 'It was cold and wet outside. Sam put on his coat and boots.', q: 'Why did Sam put on his coat?', choices: ['It was cold.', 'It was hot.', 'He was going to bed.'], why: 'The story says it was cold and wet outside.' },
  { level: 1, passage: 'The frog sat on a log. A bug flew by, and the frog ate it!', q: 'What did the frog eat?', choices: ['a bug', 'a log', 'a fish'], why: 'A bug flew by, and the frog ate it.' },
  { level: 1, passage: 'Jen has a pet fish. It is small and gold. It swims in a bowl.', q: 'Where does the fish swim?', choices: ['in a bowl', 'in the sea', 'in a bath'], why: 'The story says "It swims in a bowl."' },
  { level: 1, passage: 'The sun came up. The hens woke up and went to get some corn.', q: 'What did the hens go to get?', choices: ['corn', 'water', 'eggs'], why: 'The hens went to get some corn.' },
  { level: 2, passage: 'Lily planted a seed in a pot. She gave it water every day. Soon, a small green sprout came up.', q: 'What did Lily do every day?', choices: ['She gave the seed water.', 'She picked flowers.', 'She went to the beach.'], why: 'The story says she gave it water every day.' },
  { level: 2, passage: 'The villagers needed wood to build a house. They went to the forest with their axes. By the end of the day, they had a big pile of logs.', q: 'Why did the villagers go to the forest?', choices: ['to get wood', 'to find berries', 'to see the deer'], why: 'They needed wood to build a house.' },
  { level: 2, passage: 'Jack lost his ball in the tall grass. He looked and looked. At last, his dog found it under a bush.', q: 'Who found the ball?', choices: ['his dog', 'Jack', 'his mom'], why: 'The story says his dog found it under a bush.' },
  { level: 2, passage: 'A bird made a nest in the old tree. She laid four blue eggs. Then she sat on them to keep them warm.', q: 'Why did the bird sit on the eggs?', choices: ['to keep them warm', 'to hide from a cat', 'to eat them'], why: 'She sat on them to keep them warm.' },
  { level: 2, passage: 'Nell got up early. She fed the hens and got six eggs. Then she made eggs for breakfast.', q: 'What did Nell do first?', choices: ['She got up early.', 'She ate breakfast.', 'She fed the dog.'], why: 'The first thing in the story is "Nell got up early."' },
  { level: 2, passage: 'The sky got dark and the wind began to blow. Drops of rain hit the window. Kim was glad to be inside.', q: 'What was the weather like?', choices: ['stormy', 'sunny', 'snowy'], why: 'Dark sky, wind and rain means a storm.' },
  { level: 2, passage: 'Pat wanted to help his grandma. He swept the floor and fed her cat. Grandma gave him a big hug.', q: 'How did Pat help his grandma?', choices: ['He swept and fed the cat.', 'He baked a cake.', 'He washed the car.'], why: 'Pat swept the floor and fed her cat.' },
  { level: 3, passage: 'Long ago, people lived in small villages. There were no stores. People hunted deer and picked berries for food. They used stones to make tools. Every person had a job to help the village.', q: 'How did people get food long ago?', choices: ['They hunted and picked berries.', 'They went to the store.', 'They grew pizza.'], why: 'The story says they hunted deer and picked berries.' },
  { level: 3, passage: 'Long ago, people lived in small villages. There were no stores. People hunted deer and picked berries for food. They used stones to make tools. Every person had a job to help the village.', q: 'What did people use to make tools?', choices: ['stones', 'plastic', 'paper'], why: 'The story says they used stones to make tools.' },
  { level: 3, passage: 'Max the beaver lives by a river. He cuts down small trees with his sharp teeth. Then he drags the sticks into the water. He uses the sticks and mud to build a dam. The dam makes a quiet pond where Max can be safe.', q: 'What does Max use to build the dam?', choices: ['sticks and mud', 'rocks and sand', 'leaves and grass'], why: 'He uses the sticks and mud to build a dam.' },
  { level: 3, passage: 'Max the beaver lives by a river. He cuts down small trees with his sharp teeth. Then he drags the sticks into the water. He uses the sticks and mud to build a dam. The dam makes a quiet pond where Max can be safe.', q: 'Why does Max build a dam?', choices: ['to make a safe pond', 'to play ball', 'to eat it for lunch'], why: 'The dam makes a quiet pond where Max can be safe.' },
  { level: 3, passage: 'Ava wanted to make a snowman. First, she rolled a big ball of snow for the bottom. Next, she made a middle ball and a small head. She gave it a carrot nose and two rock eyes. Last, she put her own hat on top!', q: 'What did Ava do last?', choices: ['She put her hat on top.', 'She rolled a big ball.', 'She made the head.'], why: 'The story says "Last, she put her own hat on top!"' },
  { level: 3, passage: 'Ava wanted to make a snowman. First, she rolled a big ball of snow for the bottom. Next, she made a middle ball and a small head. She gave it a carrot nose and two rock eyes. Last, she put her own hat on top!', q: 'What did Ava use for the eyes?', choices: ['two rocks', 'two carrots', 'two sticks'], why: 'She gave it two rock eyes.' },
  { level: 3, passage: 'The ant and the bee were friends. The ant liked to dig tunnels under the ground. The bee liked to fly from flower to flower. One day it rained hard. The ant let the bee stay dry in her tunnel.', q: 'How did the ant help the bee?', choices: ['She let the bee stay dry in her tunnel.', 'She gave the bee a flower.', 'She taught the bee to fly.'], why: 'When it rained, the ant let the bee stay dry in her tunnel.' },
  { level: 3, passage: 'A knight had a big gray horse. Every morning, he brushed the horse and gave it apples. The horse was fast and strong. When the knight rode to the castle, they got there first.', q: 'What did the knight give the horse?', choices: ['apples', 'carrots', 'bread'], why: 'Every morning he gave it apples.' },
];

export const BLANKS: MCItem[] = [
  { level: 1, q: 'The sun is very ___.', choices: ['hot', 'sad', 'run'], why: 'The sun is hot.' },
  { level: 1, q: 'I can ___ a ball.', choices: ['kick', 'blue', 'tree'], why: 'You can kick a ball.' },
  { level: 1, q: 'The fish swims in the ___.', choices: ['water', 'sky', 'bed'], why: 'Fish swim in water.' },
  { level: 1, q: 'We eat soup with a ___.', choices: ['spoon', 'shoe', 'book'], why: 'We use a spoon for soup.' },
  { level: 1, q: 'A bird can ___ in the sky.', choices: ['fly', 'swim', 'dig'], why: 'Birds fly in the sky.' },
  { level: 1, q: 'My dog likes to ___ his tail.', choices: ['wag', 'sing', 'cook'], why: 'Dogs wag their tails.' },
  { level: 1, q: 'It is dark at ___.', choices: ['night', 'lunch', 'school'], why: 'It is dark at night.' },
  { level: 2, q: 'The baby was tired, so she went to ___.', choices: ['sleep', 'jump', 'school'], why: 'When you are tired, you sleep.' },
  { level: 2, q: 'Dad used a ___ to cut the wood.', choices: ['saw', 'cup', 'sock'], why: 'A saw cuts wood.' },
  { level: 2, q: 'We need ___ to build a house.', choices: ['wood', 'milk', 'music'], why: 'Houses are built with wood.' },
  { level: 2, q: 'The ice cream got soft because it was ___.', choices: ['warm', 'cold', 'green'], why: 'Warm air melts ice cream.' },
  { level: 2, q: 'I wear ___ on my feet.', choices: ['shoes', 'gloves', 'hats'], why: 'Shoes go on your feet.' },
  { level: 3, q: 'The farmer woke up ___ to milk the cows.', choices: ['early', 'purple', 'loud'], why: '"Early" tells when he woke up.' },
  { level: 3, q: 'The knight was ___, so he was not scared of the dragon.', choices: ['brave', 'tiny', 'sleepy'], why: 'Brave means not scared.' },
  { level: 3, q: 'Please be ___ in the library.', choices: ['quiet', 'noisy', 'wet'], why: 'We are quiet in a library.' },
  { level: 3, q: 'The rocket went up, up, up into ___.', choices: ['space', 'the sea', 'a box'], why: 'Rockets fly into space.' },
];

export const RHYMES: { level: number; word: string; yes: string; no: string[] }[] = [
  { level: 1, word: 'cat', yes: 'hat', no: ['cup', 'dog'] },
  { level: 1, word: 'sun', yes: 'run', no: ['sit', 'top'] },
  { level: 1, word: 'pig', yes: 'big', no: ['pan', 'bed'] },
  { level: 1, word: 'log', yes: 'frog', no: ['leg', 'map'] },
  { level: 1, word: 'bed', yes: 'red', no: ['bad', 'sit'] },
  { level: 2, word: 'cake', yes: 'lake', no: ['cook', 'kite'] },
  { level: 2, word: 'night', yes: 'light', no: ['nest', 'note'] },
  { level: 2, word: 'boat', yes: 'goat', no: ['bat', 'boot'] },
  { level: 2, word: 'king', yes: 'ring', no: ['kind', 'rug'] },
  { level: 3, word: 'tower', yes: 'flower', no: ['tiger', 'table'] },
  { level: 3, word: 'stone', yes: 'phone', no: ['stamp', 'storm'] },
  { level: 3, word: 'gold', yes: 'cold', no: ['goal', 'glad'] },
];

export const SIGHT: { level: number; word: string; lookalikes: string[] }[] = [
  { level: 1, word: 'said', lookalikes: ['sad', 'sand'] },
  { level: 1, word: 'they', lookalikes: ['then', 'the'] },
  { level: 1, word: 'was', lookalikes: ['saw', 'as'] },
  { level: 1, word: 'what', lookalikes: ['that', 'want'] },
  { level: 1, word: 'come', lookalikes: ['came', 'some'] },
  { level: 2, word: 'there', lookalikes: ['three', 'where'] },
  { level: 2, word: 'could', lookalikes: ['cold', 'would'] },
  { level: 2, word: 'because', lookalikes: ['became', 'before'] },
  { level: 2, word: 'every', lookalikes: ['very', 'ever'] },
  { level: 2, word: 'were', lookalikes: ['where', 'wear'] },
  { level: 3, word: 'thought', lookalikes: ['through', 'though'] },
  { level: 3, word: 'enough', lookalikes: ['even', 'rough'] },
  { level: 3, word: 'again', lookalikes: ['against', 'agree'] },
  { level: 3, word: 'friend', lookalikes: ['fried', 'find'] },
];

export const SPELLING: Record<number, string[]> = {
  1: ['cat', 'dog', 'sun', 'hat', 'pig', 'bed', 'fox', 'cup', 'map', 'hen', 'net', 'bug', 'log', 'red', 'big', 'run', 'top', 'box', 'web', 'axe'],
  2: ['ship', 'fish', 'frog', 'jump', 'sand', 'stop', 'flag', 'crab', 'duck', 'milk', 'chip', 'shop', 'bath', 'tent', 'nest', 'drum', 'swim', 'sled', 'deer', 'king'],
  3: ['tree', 'boat', 'rain', 'cake', 'bike', 'home', 'seed', 'farm', 'gold', 'stone', 'house', 'night', 'snake', 'sheep', 'train', 'smile', 'light', 'tower', 'berry', 'horse'],
};

// Stone Age science: plants and animals
export const SCIENCE: MCItem[] = [
  { level: 1, q: 'What do plants need to grow?', choices: ['water and sunlight', 'candy', 'toys'], why: 'Plants need water and sunlight to grow.' },
  { level: 1, q: 'Which animal hatches from an egg?', choices: ['a bird', 'a dog', 'a cat'], why: 'Baby birds hatch from eggs.' },
  { level: 1, q: 'What part of a plant is under the ground?', choices: ['the roots', 'the flower', 'the leaf'], why: 'Roots grow under the ground and drink water.' },
  { level: 1, q: 'What do bees make?', choices: ['honey', 'milk', 'wood'], why: 'Bees make honey from flowers.' },
  { level: 1, q: 'Which animal has feathers?', choices: ['a duck', 'a bear', 'a fish'], why: 'Birds like ducks have feathers.' },
  { level: 1, q: 'Where does a fish live?', choices: ['in water', 'in a tree', 'in a cave'], why: 'Fish live in water and breathe with gills.' },
  { level: 1, q: 'Which one is a living thing?', choices: ['a tree', 'a rock', 'a cloud'], why: 'A tree grows and needs water, so it is alive.' },
  { level: 1, q: 'What does a seed grow into?', choices: ['a plant', 'a rock', 'a bird'], why: 'A seed grows into a new plant.' },
  { level: 1, q: 'What gives plants light?', choices: ['the sun', 'the moon', 'the rocks'], why: 'Plants get their light from the sun.' },
  { level: 1, q: 'Which animal has a shell?', choices: ['a turtle', 'a rabbit', 'an owl'], why: 'A turtle carries its shell to stay safe.' },
  { level: 2, q: 'A baby frog is called a ___.', choices: ['tadpole', 'puppy', 'kitten'], why: 'Frogs start as tadpoles that swim in water.' },
  { level: 2, q: 'What do caterpillars turn into?', choices: ['butterflies', 'birds', 'frogs'], why: 'A caterpillar makes a chrysalis and comes out a butterfly.' },
  { level: 2, q: 'What do cows eat?', choices: ['grass', 'meat', 'rocks'], why: 'Cows eat grass and other plants.' },
  { level: 2, q: 'Which animal can live in the cold snow?', choices: ['a polar bear', 'a camel', 'a lizard'], why: 'Polar bears have thick fur and fat to stay warm.' },
  { level: 2, q: 'How do deer stay safe?', choices: ['They run fast and hide.', 'They fly away.', 'They swim deep.'], why: 'Deer have strong legs to run fast.' },
  { level: 2, q: 'A baby cow is called a ___.', choices: ['calf', 'cub', 'chick'], why: 'A baby cow is a calf.' },
  { level: 2, q: 'What helps a duck swim?', choices: ['webbed feet', 'a long tail', 'sharp claws'], why: 'Webbed feet push water like paddles.' },
  { level: 2, q: 'Which part of a plant makes seeds?', choices: ['the flower', 'the root', 'the stem'], why: 'Flowers make seeds that grow new plants.' },
  { level: 2, q: 'Bats sleep in the day and wake up at ___.', choices: ['night', 'lunch', 'noon'], why: 'Bats are awake at night.' },
  { level: 3, q: 'Why do bears sleep all winter?', choices: ['Food is hard to find in winter.', 'They are bored.', 'They are growing wings.'], why: 'In winter there is little food, so bears sleep and save energy.' },
  { level: 3, q: 'What do all animals need to live?', choices: ['food, water, and air', 'only toys', 'only sunlight'], why: 'Every animal needs food, water and air.' },
  { level: 3, q: 'An animal that eats only plants is called a ___.', choices: ['herbivore', 'meat eater', 'rock eater'], why: 'Herbivores, like deer and cows, eat only plants.' },
  { level: 3, q: 'How do worms help the soil?', choices: ['They make it better for plants.', 'They freeze it.', 'They turn it into rocks.'], why: 'Worms mix the soil and make it rich so plants grow.' },
  { level: 3, q: 'Why do many birds fly south in the fall?', choices: ['to find warm places and food', 'to visit the moon', 'to get new feathers'], why: 'Winter is cold, so many birds fly to warm places with food.' },
  { level: 3, q: 'What does a plant use its leaves for?', choices: ['to make food from sunlight', 'to walk', 'to drink milk'], why: 'Leaves catch sunlight and make food for the plant.' },
  { level: 3, q: 'Which animal is a mammal?', choices: ['a dog', 'a snake', 'a frog'], why: 'Mammals have fur or hair and feed milk to their babies. Dogs are mammals.' },
];
