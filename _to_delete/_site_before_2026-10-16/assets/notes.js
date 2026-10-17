/*
  notes.js  -  Mohamed Gharbia's notes under each page.

  The notes live in GitHub Discussions on the public Situ repository, one locked thread per page.
  A locked thread takes posts only from the repository owner, so only the author can write.
  Everyone else can read the notes and react to them.

  data/notes_map.json says which thread belongs to which page. setup_notes.ps1 writes it.
  A page with no thread in the map shows no notes box at all, so no visitor can open a new thread.
*/
(function () {
  var page = location.pathname.split("/").pop().replace(/\.html$/, "") || "index";
  fetch("data/notes_map.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (m) {
      if (!m || !m.pages || !m.pages[page] || !m.repoId || !m.categoryId) return;
      var box = document.createElement("section");
      box.className = "situ-notes";
      box.innerHTML = '<h2 class="anchored">Notes</h2>' +
        '<p class="situ-notes-who">Notes by Mohamed Gharbia. Only the author can post here. You can read them and react with GitHub.</p>' +
        '<div class="giscus"></div>';
      (document.querySelector("main.content") || document.querySelector("main") || document.body).appendChild(box);
      var s = document.createElement("script");
      s.src = "https://giscus.app/client.js";
      var d = {
        repo: m.repo, repoId: m.repoId, category: m.category, categoryId: m.categoryId,
        mapping: "number", term: String(m.pages[page]), reactionsEnabled: "1", emitMetadata: "0",
        inputPosition: "top", theme: "transparent_dark", lang: "en", loading: "lazy"
      };
      Object.keys(d).forEach(function (k) { s.dataset[k] = d[k]; });
      s.crossOrigin = "anonymous";
      s.async = true;
      box.appendChild(s);
    })
    .catch(function () { /* no map yet: no notes box */ });
})();
