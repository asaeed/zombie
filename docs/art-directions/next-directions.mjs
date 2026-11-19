const $ = id => document.getElementById(id);
const response = await fetch('next-directions.json');
if (!response.ok) throw new Error(`Concept data: HTTP ${response.status}`);
const {directions} = await response.json();
const byId = new Map(directions.map(direction => [direction.id, direction]));
const params = new URLSearchParams(location.hash.slice(1));
const selections = {a: byId.has(params.get('a')) ? params.get('a') : directions[0].id,
  b: byId.has(params.get('b')) ? params.get('b') : directions[4].id};
const dialog = $('detail');

function showDetail(direction) {
  $('detail-title').textContent = `${direction.letter} / ${direction.name}`;
  $('detail-image').src = direction.image;
  $('detail-image').alt = `${direction.name}: coherent battlefield and character pose studies`;
  $('detail-route').textContent = `Animation candidate: ${direction.method}`;
  dialog.showModal();
}
$('close-detail').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) {
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
} });

let decoded = 0;
for (const direction of directions) {
  const article = document.createElement('article'); article.className = 'direction';
  const button = document.createElement('button'); button.className = 'board';
  button.type = 'button'; button.title = `Inspect ${direction.name}`; button.setAttribute('aria-label', `Inspect ${direction.name}`);
  const image = new Image(); image.src = direction.image; image.width = direction.source.width; image.height = direction.source.height;
  image.alt = `${direction.name}: headquarters, tower, terrain, survivors and four zombie types`;
  image.addEventListener('load', () => { $('load-status').textContent = `${++decoded} / ${directions.length} loaded`; });
  image.addEventListener('error', () => { $('load-status').textContent = 'Image failed to load'; });
  button.append(image); button.addEventListener('click', () => showDetail(direction));
  const header = document.createElement('header'), letter = document.createElement('span'), name = document.createElement('h2');
  letter.className = 'letter'; letter.textContent = direction.letter; name.textContent = direction.name; header.append(letter, name);
  const description = document.createElement('p'); description.textContent = direction.description;
  const route = document.createElement('p'); route.className = 'route'; route.textContent = `Animation candidate: ${direction.method}`;
  article.append(button, header, description, route); $('gallery').append(article);
}

function updateComparison() {
  for (const side of ['a', 'b']) {
    const direction = byId.get(selections[side]), image = $(`image-${side}`);
    image.src = direction.image; image.alt = `${direction.name} concept board`;
    image.style.setProperty('--enlarged-width', `${direction.source.width * 1.5}px`);
    image.parentElement.dataset.zoom = $('zoom').value;
    $(`name-${side}`).textContent = `${direction.letter} / ${direction.name}`;
    $(`description-${side}`).textContent = direction.description;
    $(`route-${side}`).textContent = `Animation candidate: ${direction.method}`;
  }
  history.replaceState(null, '', `#${new URLSearchParams(selections)}`);
}
for (const side of ['a', 'b']) {
  const select = $(`choice-${side}`);
  for (const direction of directions) {
    const option = document.createElement('option'); option.value = direction.id;
    option.textContent = `${direction.letter} / ${direction.name}`; select.append(option);
  }
  select.value = selections[side];
  select.addEventListener('change', () => { selections[side] = select.value; updateComparison(); });
}
document.querySelectorAll('input[name="view"]').forEach(input => input.addEventListener('change', () => {
  const comparing = input.value === 'compare'; $('gallery').hidden = comparing;
  $('compare').hidden = !comparing; $('compare-controls').hidden = !comparing;
}));
$('zoom').addEventListener('change', updateComparison);
updateComparison();
