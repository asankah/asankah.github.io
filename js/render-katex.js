function renderMath() {
  if (document.readyState != "complete") {
    return;
  }

  let inlineOptions = {
    throwOnError: false,
    trust: true
  };
  let displayOptions = {
    throwOnError: false,
    trust: true,
    displayMode: true
  };

  for (let e of document.getElementsByClassName("math")) {
    if (e.classList.contains('display')) {
      katex.render(e.textContent, e, displayOptions);
    } else {
      katex.render(e.textContent, e, inlineOptions);
    }
  }
}

document.addEventListener('readystatechange', renderMath);
