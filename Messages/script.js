//Quil

const defaultTheme = "snow";

const toolbarOptions = [
  ['bold', 'italic', 'underline', 'strike', { 'script': 'sub'}, { 'script': 'super' }, { 'color': [] }, { 'background': [] },{ 'align': [] }, 'blockquote', 'code-block', { 'list': 'ordered'}, { 'list': 'bullet' }, { 'list': 'check' }, 'link', 'image', 'formula'],        // toggled buttons

  [{ 'header': [1, 2, 3, 4, 5, 6, false] }, { 'size': ['small', false, 'large', 'huge'] }],

  ['clean'],                                        // remove formatting button
];

let quill = {};

let id;
let column;
let user;
let collectivite = '';
let lastContent;
document.documentElement.lang = 'fr';

document.addEventListener('DOMContentLoaded', () => {
  const title = document.getElementById('new-title');
  const send = document.getElementById('send');

  if (title) {
    title.textContent = 'Nouveau message';
  }

  if (send) {
    send.textContent = 'Envoyer';
  }
});

const table = grist.getTable();

function Datereviver(key, value) {
  if (typeof value === 'string') {
    const date = Date.parse(value);
    if (!isNaN(date)) {
      return new Date(date);
    }
  }
  return value;
}

function makeQuill(theme){
  var quillDiv = document.createElement('div');
  quillDiv.id = 'quill';
  document.getElementById('editor').innerHTML = '';
  document.getElementById('editor').appendChild(quillDiv);

  const quill = new Quill('#quill', {
    theme: theme,
    modules: {
      toolbar: toolbarOptions,
      // imageResize: {
      //   displaySize: true
      // }
    }
  });

  // Set up config save callback
  document.getElementById("configuration").addEventListener("submit", async function(event){
    event.preventDefault();
    await saveOptions();
  });

  return quill;
}

// Helper to show or hide panels.
function showPanel(name) {
  document.getElementById("configuration").style.display = 'none';
  document.getElementById("chat").style.display = 'none';
  if(name.length !== 0)
    document.getElementById(name).style.display = '';
}

// Define handler for the Save button.
async function saveOptions() {
  const theme = document.getElementById("quillTheme").value;
  await grist.widgetApi.setOption('quillTheme', theme);
  showPanel('chat');
}

// Subscribe to grist data
grist.ready({requiredAccess: 'full', columns: [{name: 'Messages', type: 'Text'}, {name: 'User', type: 'Text', optional: true}, {name: 'Collectivité', type: 'Choice'}],
  // Register configuration handler to show configuration panel.
  onEditOptions() {
    showPanel('configuration');
  },
});

grist.onRecord(function (record, mappings) {
  quill.enable();
  showPanel('chat');
  const mapped = grist.mapColumnNames(record);
  collectivite = mapped?.['Collectivité'] || '';
  // If this is a new record, or mapping is diffrent.
  if (id !== record.id || mappings?.Messages !== column) {
    id = record.id;
    column = mappings?.Messages;
    user = mappings?.User
    if (!mapped) {
      // Log but don't bother user - maybe we are just testing.
      console.error('Please map columns');
    } else { //if (lastContent !== mapped.Content) 
      // We will remember last thing sent, to not remove progress.
      const msg = mapped.Messages?.replace('|-¤-|','');
      if (!msg || msg.trim().length === 0) {
        lastContent = [];
      } else {
        lastContent = JSON.parse(msg, Datereviver);
      }

      //load content
      LoadMesssages(lastContent);
    }
  }
});

grist.onNewRecord(function () {
  document.getElementById('msg-container').innerHTML = '';
  showPanel('');
  id = null;
  collectivite = '';
  lastContent = [];
  quill.setContents(null);
  quill.disable();
})

// Register onOptions handler.
grist.onOptions((customOptions, _) => {
  customOptions = customOptions || {};
  theme = customOptions.quillTheme || defaultTheme;
  document.getElementById("quillTheme").value = theme;
  quill = makeQuill(theme);
  showPanel("chat");
});


function getCollectiviteLogo(value) {
  if (!value) return '';

  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'LTM') {
    return './images/LTM.png';
  }

  if (normalized === 'CIAS') {
    return './images/CIAS.png';
  }

  if (normalized === 'VILLE') {
    return './images/Logo-lamballe-armor.png';
  }

  return '';
}

function isSafeUrl(value) {
  if (!value) return false;

  const trimmed = String(value).trim();
  if (trimmed.startsWith('data:image/')) return true;

  try {
    const url = new URL(trimmed, window.location.href);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) || trimmed.startsWith('/');
  } catch (error) {
    return false;
  }
}

function sanitizeHtml(value) {
  const container = document.createElement('div');
  container.innerHTML = String(value || '');

  const allowedTags = new Set(['a', 'b', 'blockquote', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub', 'sup', 'u', 'ul']);
  const allowedAttributes = new Set(['href', 'src', 'alt', 'title', 'target', 'rel']);
  const allowedStyles = new Set(['color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'vertical-align']);

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      if (!allowedTags.has(tagName)) {
        node.replaceWith(...node.childNodes);
        return;
      }

      if (tagName === 'a') {
        const href = node.getAttribute('href');
        if (!isSafeUrl(href)) {
          node.removeAttribute('href');
        }
      }

      if (tagName === 'img') {
        const src = node.getAttribute('src');
        if (!isSafeUrl(src)) {
          node.removeAttribute('src');
        }
      }

      for (const attribute of [...node.attributes]) {
        const name = attribute.name.toLowerCase();
        if (!allowedAttributes.has(name)) {
          node.removeAttribute(attribute.name);
          continue;
        }

        if (name === 'style') {
          const styleEntries = attribute.value
            .split(';')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => entry.split(':'));

          const safeStyleParts = styleEntries
            .filter(([property]) => allowedStyles.has(property.trim().toLowerCase()))
            .map(([property, value]) => `${property.trim()}: ${value.trim()}`);

          if (safeStyleParts.length > 0) {
            node.setAttribute('style', safeStyleParts.join('; '));
          } else {
            node.removeAttribute('style');
          }
          continue;
        }

        if (name === 'href' || name === 'src') {
          if (!isSafeUrl(attribute.value)) {
            node.removeAttribute(attribute.name);
          }
        }
      }

      if (node.hasAttribute('href') && !node.hasAttribute('rel')) {
        node.setAttribute('rel', 'noopener noreferrer');
      }

      if (node.hasAttribute('href') && !node.hasAttribute('target')) {
        node.setAttribute('target', '_blank');
      }

      for (const child of [...node.childNodes]) {
        sanitizeNode(child);
      }
    }
  };

  for (const child of [...container.childNodes]) {
    sanitizeNode(child);
  }

  return container.innerHTML;
}

function DisplayMessage(author, date, message) {
  const card = document.createElement('div');
  card.className = 'card';
  const normalizedAuthor = (!author || author.trim().length === 0) ? '' : author;

  const header = document.createElement('div');
  header.className = 'card-header';

  const authorWrapper = document.createElement('span');
  authorWrapper.className = 'author';
  authorWrapper.textContent = normalizedAuthor;

  const logoUrl = getCollectiviteLogo(collectivite);
  if (logoUrl) {
    const logo = document.createElement('img');
    logo.src = logoUrl;
    logo.alt = 'logo collectivité';
    logo.style.height = '24px';
    logo.style.width = 'auto';
    logo.style.verticalAlign = 'middle';
    logo.style.marginLeft = '6px';
    authorWrapper.appendChild(logo);
  }

  const dateWrapper = document.createElement('span');
  dateWrapper.className = 'date';
  dateWrapper.textContent = date.toLocaleString('fr-FR');

  header.appendChild(authorWrapper);
  header.appendChild(dateWrapper);

  const content = document.createElement('div');
  content.className = 'card-content';

  const messageWrapper = document.createElement('div');
  messageWrapper.className = 'card-message';
  messageWrapper.innerHTML = sanitizeHtml(message);

  content.appendChild(messageWrapper);
  card.appendChild(header);
  card.appendChild(content);

  document.getElementById('msg-container').appendChild(card);
}

function LoadMesssages(messages) {
  document.getElementById('msg-container').innerHTML = '';

  let data;
  for (let i = 0; i < messages.length; i++) {
    data = messages[i];
    if (data.length > 2)
      DisplayMessage(data[0], data[1], data[2]);
  }
}

function AddMessage(author, date, message){
  //Display the message
  DisplayMessage(author, date, message);    
    
  //Update the table
  lastContent.push([author, date, message]);  
  table.update({id, fields: {[column]: JSON.stringify(lastContent)}});
}

function AddNewMessage() {
  // If we are mapped.
  if (column && id) {  
    let author = '';
    
    //Prepare data
    let date = new Date();
    const message = quill.getSemanticHTML();

    if (!message || message.trim().length === 0 || message == '<p></p>') return;

    //update table to refresh user
    if (user && user.trim().length > 0) {
      table.update({id, fields: {[column]: JSON.stringify(lastContent)+'|-¤-|'}}).then((result)=> {
        grist.fetchSelectedRecord(id).then((row)=> {
          author = row[user];
          //Display message
          AddMessage(author, date, message);
          //reset editor
          quill.setContents(null);

        }, (error) => {console.error(error)});      
      }, (error) => {console.error(error)});
    } else {
      //Display message
      AddMessage(author, date, message);
      //reset editor
      quill.setContents(null);
    }    
  }  
}






