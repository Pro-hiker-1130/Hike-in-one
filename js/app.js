// Hike-in-one — App shell: modal stack and Back button, the phone map sheet, page navigation, event wiring and start-up.
// Plain scripts loaded in order by index.html; they share one global scope.
'use strict';

// ---- Back-button support ----
// Every view change here just toggled a div's display — the browser's
// history never grew past the one entry from the initial page load, so
// Back/the phone's back gesture exited the app instead of undoing the
// last navigation. These two pieces fix that:
//   1. Route state for the three pages and their sub-views (garage/
//      category/loadout, trips list/detail) — pushed by the existing
//      show*() functions, which are already the single place every
//      navigation (nav tabs, map popup links, trip/loadout cards, the
//      in-app "<- Garage"/"<- Trips" buttons) already flows through.
//   2. A small modal stack, since this app also has ~8 modals/overlays
//      that can nest (e.g. the barcode scanner opens on top of the add-
//      gear modal) — Back should close the top one, matching how a
//      native app's back button dismisses a dialog before leaving the
//      page underneath it.
let appInitializing = true;
let suppressRoutePush = false;

function currentRouteState(){
  const page = document.querySelector('.nav-tab.active')?.dataset.page || 'map';
  if(page === 'gear'){
    if(currentLoadoutId !== null) return {page, view:'loadout', param: currentLoadoutId};
    if(currentGearCategory !== null) return {page, view:'category', param: currentGearCategory};
    return {page, view:'garage'};
  }
  if(page === 'trips'){
    if(currentTripId !== null) return {page, view:'detail', param: currentTripId};
    return {page, view:'list'};
  }
  return {page};
}

function pushRouteState(){
  if(suppressRoutePush || appInitializing) return;
  history.pushState(currentRouteState(), '', location.pathname + location.search);
}

function applyRouteFromPopstate(route){
  route = route || {page:'map'};
  suppressRoutePush = true;
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('active', t.dataset.page===route.page));
  document.getElementById('pageMap').classList.toggle('active', route.page==='map');
  document.getElementById('pageGear').classList.toggle('active', route.page==='gear');
  document.getElementById('pageTrips').classList.toggle('active', route.page==='trips');
  document.getElementById('pageSettings').classList.toggle('active', route.page==='settings');
  if(route.page==='map') setTimeout(()=>{ map.invalidateSize(); updateLayers(); }, 50);
  if(route.page==='gear'){
    if(route.view==='category') showCategory(route.param);
    else if(route.view==='loadout') showLoadoutDetail(route.param);
    else showGarage();
  } else if(route.page==='trips'){
    if(route.view==='detail') showTripDetail(route.param);
    else showTripsList();
  }
  suppressRoutePush = false;
}

// id -> close function, for every modal/overlay that can be open at once.
const MODAL_CLOSE_FNS = {
  gearModalOverlay: closeGearModal,
  tripGearModalOverlay: closeGearPickerModal,
  tripModalOverlay: closeTripModal,
  loadoutModalOverlay: closeLoadoutModal,
  barcodeModalOverlay: closeBarcodeScanner,
  cloudSignInModalOverlay: closeCloudSignInModal,
  stravaModalOverlay: closeStravaModal,
  photoLightboxOverlay: closePhotoLightbox,
  importModalOverlay: closeImportModal,
  catalogProductModalOverlay: closeCatalogProductModal,
  catalogDetailModalOverlay: closeCatalogDetail,
  catalogBulkModalOverlay: closeCatalogBulkModal,
  catalogBrowseModalOverlay: closeCatalogBrowser,
};
let openModalOrder = [];      // most-recently-opened last
let expectingCleanupPop = false;  // a history.back() we triggered ourselves, to drop a closed modal's entry
let closingViaPopstate = false;   // true while a close fn runs because Back told it to, not a UI click
let afterCleanupPop = null;       // navigation waiting for that history.back() to land
// Navigating right after closing a modal would push a new entry before
// the modal's own entry is popped, and that pop would then undo it.
function afterModalCleanup(fn){
  if(expectingCleanupPop) afterCleanupPop = fn; else fn();
}

function onModalOpened(id){
  if(openModalOrder.includes(id)) return; // already open - re-opening to edit something else shouldn't stack another entry
  openModalOrder.push(id);
  // Stack by opening order, so a modal opened from another (e.g. the
  // catalog product form from the product page) is always on top,
  // whatever their order in the markup.
  const el = document.getElementById(id);
  if(el && id !== 'photoLightboxOverlay') el.style.zIndex = String(1000 + openModalOrder.length);
  history.pushState({modal:id}, '', location.pathname + location.search);
}
function onModalClosed(id){
  if(!openModalOrder.includes(id)) return; // wasn't open - e.g. a defensive double-close
  openModalOrder = openModalOrder.filter(x=>x!==id);
  if(!closingViaPopstate){
    // Closed by a UI click, not by Back — the history entry this modal
    // pushed is still sitting there as "current"; consume it so Back
    // doesn't later land on a no-op (modal already closed) and need a
    // second press to actually go anywhere.
    expectingCleanupPop = true;
    history.back();
  }
}

// Escape closes the dialog on top, like its × button. (The lightbox and
// the catalog search box handle Escape themselves.)
document.addEventListener('keydown', e=>{
  if(e.key !== 'Escape' || e.defaultPrevented || !openModalOrder.length) return;
  const top = openModalOrder[openModalOrder.length-1];
  if(top === 'photoLightboxOverlay') return;
  if(top === 'importModalOverlay' && importRun) return;   // don't lose a scan in progress
  e.preventDefault();
  MODAL_CLOSE_FNS[top]();
});

window.addEventListener('popstate', (e)=>{
  if(expectingCleanupPop){
    expectingCleanupPop = false;
    const fn = afterCleanupPop; afterCleanupPop = null;
    if(fn) fn();
    return;
  }
  if(openModalOrder.length){
    const topId = openModalOrder[openModalOrder.length-1];
    closingViaPopstate = true;
    MODAL_CLOSE_FNS[topId]();
    closingViaPopstate = false;
    return;
  }
  applyRouteFromPopstate(e.state);
});

// ---- Map panel on phones: a sheet you drag (or tap) to give the map more room ----
(function(){
  const sheet = document.getElementById('mapSheet');
  const handle = document.getElementById('mapSheetHandle');
  const area = document.getElementById('pageMap');
  const phone = window.matchMedia('(max-width:760px)');
  // Heights the sheet settles on: just the handle (map nearly full
  // screen), the overview stats, half, and most of the screen.
  function stops(){
    const h = area.clientHeight;
    return [28, 150, Math.round(h * 0.45), Math.round(h * 0.8)];
  }
  let current = null;   // px; null = the CSS default (45%)
  try{ const saved = Number(localStorage.getItem('hio-map-sheet')); if(saved > 0) current = saved; }catch(e){}
  let raf = 0;
  function apply(px, settle){
    const h = area.clientHeight;
    if(px != null) px = Math.max(28, Math.min(px, h - 80));
    current = px;
    sheet.style.setProperty('--sheet-h', px == null ? '' : px + 'px');
    if(px == null) sheet.style.removeProperty('--sheet-h');
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(()=> map.invalidateSize({ pan: false }));
    if(settle){
      try{ localStorage.setItem('hio-map-sheet', String(px)); }catch(e){}
      handle.setAttribute('aria-label', px <= 40 ? 'Show the map panel' : 'Resize the map panel');
    }
  }
  function nearestStop(px){
    return stops().reduce((best, s) => Math.abs(s - px) < Math.abs(best - px) ? s : best);
  }
  function currentHeight(){ return sheet.getBoundingClientRect().height; }

  let drag = null;
  handle.addEventListener('pointerdown', e=>{
    if(!phone.matches) return;
    drag = { y: e.clientY, start: currentHeight(), moved: false };
    handle.setPointerCapture(e.pointerId);
    sheet.classList.add('is-dragging');
  });
  handle.addEventListener('pointermove', e=>{
    if(!drag) return;
    const dy = drag.y - e.clientY;
    if(Math.abs(dy) > 4) drag.moved = true;
    if(drag.moved) apply(drag.start + dy, false);
  });
  // A tap is handled on its click, not on pointerup: resizing earlier
  // moves other controls under the finger, and the click that follows a
  // touch would then land on them (e.g. the Heatmap button).
  let ignoreClickUntil = 0;
  function endDrag(){
    if(!drag) return;
    const d = drag; drag = null;
    sheet.classList.remove('is-dragging');
    if(d.moved){
      apply(nearestStop(currentHeight()), true);
      ignoreClickUntil = Date.now() + 400;
    }
  }
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  // Tap / Enter: next size up, wrapping round to the smallest.
  function stepSheet(dir){
    const st = stops();
    const at = st.indexOf(nearestStop(currentHeight()));
    const next = dir > 0 ? (at + 1) % st.length : Math.max(0, at - 1);
    apply(st[next], true);
  }
  handle.addEventListener('click', ()=>{ if(Date.now() >= ignoreClickUntil) stepSheet(1); });
  handle.addEventListener('keydown', e=>{
    if(e.key === 'ArrowUp'){ e.preventDefault(); stepSheet(1); }
    if(e.key === 'ArrowDown'){ e.preventDefault(); stepSheet(-1); }
  });
  if(current != null) apply(current, false);
  phone.addEventListener('change', ()=> map.invalidateSize());
})();

// ---- Page navigation ----
document.querySelectorAll('.nav-tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const page = tab.dataset.page;
    document.getElementById('pageMap').classList.toggle('active', page==='map');
    document.getElementById('pageGear').classList.toggle('active', page==='gear');
    document.getElementById('pageTrips').classList.toggle('active', page==='trips');
    document.getElementById('pageSettings').classList.toggle('active', page==='settings');
    if(page === 'settings'){ try{ renderDeviceSummary(); }catch(e){} pushRouteState(); }
    if(page === 'map'){
      renderGettingStarted();
      setTimeout(()=>{
        map.invalidateSize();
        updateLayers();
        // Fitting while the map was hidden (size 0) zooms to nonsense, so
        // an import elsewhere just asks for a fit on the next visit.
        if(fitMapOnNextShow){
          fitMapOnNextShow = false;
          const b = L.latLngBounds(allPoints());
          if(b.isValid()) map.fitBounds(b, {padding:[40,40]});
        }
      }, 50);
      pushRouteState();
    }
    if(page === 'gear') showGarage();
    if(page === 'trips') showTripsList();
  });
});

// ---- Gear Room wiring ----
document.getElementById('gearForm').addEventListener('input', ()=> syncGearMoreDetails(false));
document.getElementById('gearForm').addEventListener('change', ()=> syncGearMoreDetails(false));
document.getElementById('addGearBtnGarage').addEventListener('click', ()=> openCatalogBrowser(null));
document.getElementById('viewAllGearBtn').addEventListener('click', ()=> showCategory('ALL'));
document.querySelectorAll('#gearViewToggle button').forEach(b=> b.addEventListener('click', ()=> setGearView(b.dataset.gearview)));
setGearView(gearView);
NARROW_SCENE.addEventListener('change', ()=>{
  if(currentGearCategory === null && currentLoadoutId === null) renderGarage();
});

// ---- Gear breakdown chart wiring (metric filter + table toggle, shared pattern) ----
['gear','loadout'].forEach(prefix=>{
  document.getElementById(prefix+'BreakdownMetric').addEventListener('change', ()=>{
    const items = prefix === 'gear'
      ? gearItems.filter(g=>OWNED_STATUSES.includes(g.status))
      : loadoutItemsList(loadouts.find(x=>x.id===currentLoadoutId) || {gearIds:[]});
    renderBreakdownChart(prefix, items);
  });
  document.getElementById(prefix+'BreakdownTableToggle').addEventListener('click', ()=>{
    const chartWrap = document.getElementById(prefix+'BreakdownBody');
    const tableEl = document.getElementById(prefix+'BreakdownTable');
    const btn = document.getElementById(prefix+'BreakdownTableToggle');
    const showingTable = tableEl.style.display !== 'none';
    tableEl.style.display = showingTable ? 'none' : 'block';
    chartWrap.style.display = showingTable ? 'flex' : 'none';
    btn.textContent = showingTable ? 'View as table' : 'View as chart';
  });
});
document.getElementById('addGearBtn').addEventListener('click', ()=> openCatalogBrowser(currentGearCategory === 'ALL' ? null : currentGearCategory));
document.getElementById('backToGarageBtn').addEventListener('click', showGarage);
document.getElementById('gearModalClose').addEventListener('click', closeGearModal);
document.getElementById('gearCancelBtn').addEventListener('click', closeGearModal);
document.getElementById('gearModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'gearModalOverlay') closeGearModal();
});
document.getElementById('gearForm').addEventListener('submit', handleGearFormSubmit);
document.getElementById('gearDeleteBtn').addEventListener('click', handleGearDelete);
document.getElementById('gearSearch').addEventListener('input', renderGearGrid);
document.getElementById('gearStatusFilter').addEventListener('change', renderGearGrid);
document.getElementById('gearSort').addEventListener('change', renderGearGrid);

// ---- Quick add (URL preview / barcode scan) wiring ----
document.getElementById('gearUrlFetchBtn').addEventListener('click', ()=>{
  const url = document.getElementById('gearUrlInput').value.trim();
  if(url) fetchGearFromUrl(url);
});
document.getElementById('gearUrlInput').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    e.preventDefault();
    document.getElementById('gearUrlFetchBtn').click();
  }
});
document.getElementById('gearBarcodeBtn').addEventListener('click', openBarcodeScanner);
document.getElementById('barcodeModalClose').addEventListener('click', closeBarcodeScanner);
document.getElementById('barcodeModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'barcodeModalOverlay') closeBarcodeScanner();
});

// ---- Cloud sign-in modal wiring ----
document.getElementById('cloudSignInModalClose').addEventListener('click', closeCloudSignInModal);
document.getElementById('cloudSignInModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'cloudSignInModalOverlay') closeCloudSignInModal();
});
document.getElementById('cloudSignInForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const email = document.getElementById('cloudSignInEmail').value.trim();
  if(email) sendMagicLink(email);
});

// ---- Strava wiring ----
document.getElementById('stravaImportBtn').style.display = STRAVA_ENABLED ? 'inline-block' : 'none';
document.getElementById('stravaImportBtn').addEventListener('click', openStravaModal);
document.getElementById('stravaModalClose').addEventListener('click', closeStravaModal);
document.getElementById('stravaModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'stravaModalOverlay') closeStravaModal();
});
document.getElementById('stravaConnectBtn').addEventListener('click', ()=>{
  window.location.href = stravaConnectUrl();
});
if(STRAVA_ENABLED) consumeStravaRedirect();

// ---- Gear picker wiring ----
document.getElementById('tripGearModalClose').addEventListener('click', closeGearPickerModal);
document.getElementById('tripGearCancelBtn').addEventListener('click', closeGearPickerModal);
document.getElementById('tripGearSaveBtn').addEventListener('click', saveGearPicker);
document.getElementById('tripGearModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'tripGearModalOverlay') closeGearPickerModal();
});

// ---- Trips wiring ----
document.getElementById('addTripBtn').addEventListener('click', ()=> openTripModal(null));
document.getElementById('backToTripsBtn').addEventListener('click', showTripsList);
document.getElementById('tripEditBtn').addEventListener('click', ()=> openTripModal(currentTripId));
document.getElementById('tripGearEditBtn').addEventListener('click', ()=> openGearPickerModal(currentTripId));
document.getElementById('tripViewOnMapBtn').addEventListener('click', ()=>{
  const trip = trips.find(t=>t.id===currentTripId);
  if(!trip) return;
  const tks = tripTracks(trip);
  if(!tks.length) return;
  document.querySelector('.nav-tab[data-page="map"]').click();
  setTimeout(()=>{
    const b = L.latLngBounds(tks.flatMap(t=>t.points));
    if(b.isValid()) map.fitBounds(b, {padding:[40,40]});
  }, 100);
});
document.getElementById('tripModalClose').addEventListener('click', closeTripModal);
document.getElementById('tripCancelBtn').addEventListener('click', closeTripModal);
document.getElementById('tripModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'tripModalOverlay') closeTripModal();
});
document.getElementById('tripForm').addEventListener('submit', handleTripFormSubmit);
document.getElementById('tripDeleteBtn').addEventListener('click', handleTripDelete);
document.querySelectorAll('#tripStatusToggle button').forEach(b=>{
  b.addEventListener('click', ()=>{
    tripStatusTouched = true;
    setTripStatusToggle(b.dataset.status);
  });
});
document.getElementById('tripTrackPicker').addEventListener('change', (e)=>{
  if(e.target.matches('input[type="checkbox"]')) maybeAutoSetTripStatus();
});
document.getElementById('tripLoadoutSelect').addEventListener('change', async (e)=>{
  const loadoutId = e.target.value;
  const trip = trips.find(t=>t.id===currentTripId);
  if(!trip) return;
  if(!loadoutId){
    trip.loadoutId = null;
  } else {
    const lo = loadouts.find(x=>x.id===loadoutId);
    if(lo){
      trip.gearIds = (lo.gearIds || []).slice();
      trip.loadoutId = lo.id;
    }
  }
  await saveTrips();
  renderTripDetail();
  renderTripCards();
});

// ---- Loadouts wiring ----
document.getElementById('addLoadoutBtn').addEventListener('click', ()=> openLoadoutModal(null));
document.getElementById('backToGarageFromLoadoutBtn').addEventListener('click', showGarage);
document.getElementById('loadoutEditBtn').addEventListener('click', ()=> openLoadoutModal(currentLoadoutId));
document.getElementById('loadoutModalClose').addEventListener('click', closeLoadoutModal);
document.getElementById('loadoutCancelBtn').addEventListener('click', closeLoadoutModal);
document.getElementById('loadoutModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'loadoutModalOverlay') closeLoadoutModal();
});
document.getElementById('loadoutForm').addEventListener('submit', handleLoadoutFormSubmit);
document.getElementById('loadoutDeleteBtn').addEventListener('click', handleLoadoutDelete);

// ---- Wiring ----
document.getElementById('googleInput').addEventListener('change', e=>handleGoogleFile(e.target.files[0]));

['googleDropzone'].forEach(id=>{
  const zone = document.getElementById(id);
  zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', ()=> zone.classList.remove('dragover'));
  zone.addEventListener('drop', e=>{
    e.preventDefault(); zone.classList.remove('dragover');
    handleGoogleFile(e.dataTransfer.files[0]);
  });
});

document.getElementById('tripGpxInput').addEventListener('change', e=>{
  handleTripGpxFiles(e.target.files);
  e.target.value = '';
});
(function(){
  const zone = document.getElementById('tripGpxDropzone');
  zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', ()=> zone.classList.remove('dragover'));
  zone.addEventListener('drop', e=>{
    e.preventDefault(); zone.classList.remove('dragover');
    handleTripGpxFiles(e.dataTransfer.files);
  });
})();

// ---- Gear catalog wiring ----
document.getElementById('catalogSearchInput').addEventListener('input', onCatalogSearchInput);
document.getElementById('catalogSearchInput').addEventListener('focus', e=>{
  // A prefilled "link this item" query searches the first time it's focused.
  const q = e.target.value.trim();
  if(q.length >= 2 && catalogSearchedValue !== q) runCatalogSearch(q);
});
document.getElementById('catalogSearchInput').addEventListener('keydown', e=>{
  if(e.key === 'ArrowDown'){
    const first = document.querySelector('#catalogResults .catalog-result');
    if(first){ e.preventDefault(); first.focus(); }
  } else if(e.key === 'Enter'){
    e.preventDefault();
    const q = e.target.value.trim();
    if(q.length >= 2){ clearTimeout(catalogSearchTimer); runCatalogSearch(q); }
  } else if(e.key === 'Escape' && !document.getElementById('catalogResults').hidden){
    e.stopPropagation();
    hideCatalogResults();
  }
});
document.getElementById('catalogResults').addEventListener('keydown', e=>{
  if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = Array.from(document.querySelectorAll('#catalogResults .catalog-result'));
  const i = items.indexOf(document.activeElement);
  if(i < 0) return;
  e.preventDefault();
  if(e.key === 'ArrowUp' && i === 0) document.getElementById('catalogSearchInput').focus();
  else (items[i + (e.key === 'ArrowDown' ? 1 : -1)] || items[i]).focus();
});
Object.values(GEAR_LINKED_INPUTS).forEach(id=>{
  document.getElementById(id).addEventListener('input', ()=>{ if(CATALOG_ENABLED) renderCatalogOverrides(); });
  document.getElementById(id).addEventListener('change', ()=>{ if(CATALOG_ENABLED) renderCatalogOverrides(); });
});
document.getElementById('catalogLinkView').addEventListener('click', ()=>{
  const link = currentFormLink();
  if(link) openCatalogDetail(link.id);
});
document.getElementById('catalogLinkRefresh').addEventListener('click', refreshGearFromCatalog);
document.getElementById('catalogLinkUnlink').addEventListener('click', unlinkGearFromCatalog);
document.getElementById('catalogProductModalClose').addEventListener('click', closeCatalogProductModal);
document.getElementById('cpCancelBtn').addEventListener('click', closeCatalogProductModal);
document.getElementById('catalogProductForm').addEventListener('submit', submitCatalogProduct);
document.getElementById('cpCategory').addEventListener('change', e=>{
  const specs = {};
  document.querySelectorAll('#cpSpecs [data-spec]').forEach(el=>{ specs[el.dataset.spec] = el.value; });
  renderSpecFields(e.target.value, specs);
});
['cpBrand','cpName','cpModel'].forEach(id=> document.getElementById(id).addEventListener('input', ()=>{
  // Identity changed: re-run the duplicate check on the next submit.
  if(cpState){ cpState.confirmedDifferent = false; document.getElementById('cpSimilar').hidden = true; }
}));
document.getElementById('catalogDetailModalClose').addEventListener('click', closeCatalogDetail);
document.getElementById('cdEditBtn').addEventListener('click', ()=>{
  if(!cdState || !cdState.product) return;
  if(!cloudUser){ openCloudSignInModal(); return; }
  openCatalogProductModal({ mode: 'edit', product: cdState.product, onSaved: ()=> loadCatalogDetail() });
});
document.getElementById('cdUseBtn').addEventListener('click', ()=>{
  const use = cdState && cdState.onUse, id = cdState && cdState.id;
  closeCatalogDetail();
  if(use) afterModalCleanup(()=> use(id));
});
document.getElementById('cdAddPhotoLabel').addEventListener('click', e=>{
  if(!cloudUser){ e.preventDefault(); openCloudSignInModal(); }
});
document.getElementById('cdPhotoInput').addEventListener('change', e=>{
  const files = Array.from(e.target.files);
  e.target.value = '';
  addCatalogPhotos(files);
});
document.getElementById('cdWriteReviewBtn').addEventListener('click', openReviewForm);
document.getElementById('cdReviewCancelBtn').addEventListener('click', closeReviewForm);
document.getElementById('cdReviewForm').addEventListener('submit', submitReview);
document.getElementById('cdReviewDeleteBtn').addEventListener('click', deleteMyReview);
document.querySelectorAll('#cdStars input').forEach(input=>{
  input.addEventListener('change', ()=> setReviewStars(Number(input.value)));
});

// ---- Catalog browser wiring ----
document.getElementById('catalogBrowseModalClose').addEventListener('click', closeCatalogBrowser);
document.getElementById('catalogBrowseModalOverlay').addEventListener('click', e=>{ if(e.target.id === 'catalogBrowseModalOverlay') closeCatalogBrowser(); });
document.getElementById('cbSearch').addEventListener('input', ()=>{
  clearTimeout(cbSearchTimer);
  cbSearchTimer = setTimeout(()=> loadCatalogPage(true), 250);
});
document.getElementById('cbCategory').addEventListener('change', ()=>{ renderCatalogFilters(); loadCatalogPage(true); });
document.getElementById('cbBrand').addEventListener('change', ()=> loadCatalogPage(true));
document.getElementById('cbSort').addEventListener('change', ()=> loadCatalogPage(true));
document.getElementById('cbSource').addEventListener('change', ()=> loadCatalogPage(true));
document.getElementById('cbManualBtn').addEventListener('click', ()=>{
  const preset = cbState ? cbState.presetCategory : null;
  closeCatalogBrowser();
  afterModalCleanup(()=> openGearModal(null, preset));
});
document.getElementById('cbContributeBtn').addEventListener('click', ()=>{
  if(!cloudUser){ openCloudSignInModal(); return; }
  const q = document.getElementById('cbSearch').value.trim();
  openCatalogProductModal({ mode: 'create', seed: { name: q, category: document.getElementById('cbCategory').value || 'Other' },
    onSaved: p => useCatalogProductFromBrowser(p.id), onPickExisting: id => useCatalogProductFromBrowser(id) });
});

// ---- Catalog link lookup + bulk add wiring ----
document.getElementById('catalogBulkBtn').hidden = !CATALOG_ENABLED;
document.getElementById('catalogBulkBtn').addEventListener('click', openCatalogBulkModal);
document.getElementById('cpLookupBtn').addEventListener('click', runProductFormLookup);
document.getElementById('cpLookupUrl').addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); runProductFormLookup(); } });
document.getElementById('catalogBulkModalClose').addEventListener('click', closeCatalogBulkModal);
document.getElementById('bulkLookupBtn').addEventListener('click', runBulkLookup);
document.getElementById('bulkCancelBtn').addEventListener('click', ()=>{
  if(bulkRun) bulkRun.cancelled = true;
  bulkRun = null;
  showBulkStep('paste');
});
document.getElementById('bulkBackBtn').addEventListener('click', ()=> showBulkStep('paste'));
document.getElementById('bulkAddBtn').addEventListener('click', addBulkToCatalog);
document.getElementById('bulkMoreBtn').addEventListener('click', ()=>{ document.getElementById('bulkUrls').value = ''; showBulkStep('paste'); });
document.getElementById('bulkDoneBtn').addEventListener('click', closeCatalogBulkModal);

// ---- Import activities wiring ----
document.getElementById('importActivitiesBtn').addEventListener('click', openImportModal);
['emptyHintImportBtn','mapImportBtn'].forEach(id=> document.getElementById(id).addEventListener('click', ()=>{
  document.querySelector('.nav-tab[data-page="trips"]').click();
  openImportModal();
}));
document.getElementById('importModalClose').addEventListener('click', closeImportModal);
document.getElementById('importModalOverlay').addEventListener('click', e=>{
  // Don't lose a long scan to a stray click outside the dialog.
  if(e.target.id === 'importModalOverlay' && !importRun) closeImportModal();
});
document.getElementById('importInput').addEventListener('change', e=>{
  const files = Array.from(e.target.files);
  e.target.value = '';
  scanImportFiles(files);
});
(function(){
  const zone = document.getElementById('importDropzone');
  zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', ()=> zone.classList.remove('dragover'));
  zone.addEventListener('drop', e=>{
    e.preventDefault(); zone.classList.remove('dragover');
    scanImportFiles(e.dataTransfer.files);
  });
})();
document.getElementById('importCancelBtn').addEventListener('click', ()=>{
  const wasImporting = importRun && importRun.phase === 'import';
  if(importRun) importRun.cancelled = true;
  importRun = null;
  // Cancelling an import goes back to the review list (nothing was
  // saved yet); cancelling a scan starts over.
  if(wasImporting) showImportStep('review');
  else { importItems = []; showImportStep('pick'); }
});
document.querySelectorAll('#importStepReview [data-select]').forEach(b=>{
  b.addEventListener('click', ()=> applyImportPreset(b.dataset.select));
});
document.getElementById('importGroupDays').addEventListener('change', updateImportConfirm);
document.getElementById('importBackBtn').addEventListener('click', ()=>{ importItems = []; showImportStep('pick'); });
document.getElementById('importConfirmBtn').addEventListener('click', runImport);
document.getElementById('importMoreBtn').addEventListener('click', ()=>{ importItems = []; showImportStep('pick'); });
document.getElementById('importViewTripsBtn').addEventListener('click', ()=>{
  closeImportModal();
  afterModalCleanup(()=>{
    document.querySelector('.nav-tab[data-page="trips"]').click();
  });
});

// ---- Trip photos wiring ----
function currentPhotoTrip(){ return trips.find(t=>t.id===currentTripId) || null; }
document.getElementById('tripPhotoInput').addEventListener('change', e=>{
  const trip = currentPhotoTrip();
  if(trip) addPhotosToTrip(trip, e.target.files);
  e.target.value = '';
});
(function(){
  const zone = document.getElementById('tripPhotoDropzone');
  zone.addEventListener('dragover', e=>{ e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', ()=> zone.classList.remove('dragover'));
  zone.addEventListener('drop', e=>{
    e.preventDefault(); zone.classList.remove('dragover');
    const trip = currentPhotoTrip();
    if(trip) addPhotosToTrip(trip, e.dataTransfer.files);
  });
})();

document.getElementById('photoLightboxClose').addEventListener('click', closePhotoLightbox);
document.getElementById('photoLightboxPrev').addEventListener('click', ()=> lightboxStep(-1));
document.getElementById('photoLightboxNext').addEventListener('click', ()=> lightboxStep(1));
document.getElementById('photoLightboxOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'photoLightboxOverlay') closePhotoLightbox();
});
document.addEventListener('keydown', (e)=>{
  if(document.getElementById('photoLightboxOverlay').hidden) return;
  if(e.key === 'Escape') closePhotoLightbox();
  else if(e.key === 'ArrowLeft') lightboxStep(-1);
  else if(e.key === 'ArrowRight') lightboxStep(1);
});

document.querySelectorAll('.view-toggle:not(#basemapToggle):not(#gearViewToggle) button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.view-toggle:not(#basemapToggle):not(#gearViewToggle) button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    updateLayers();
  });
});

document.querySelectorAll('#basemapToggle button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#basemapToggle button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    setBasemap(btn.dataset.basemap);
  });
});

// ---- Getting started wiring ----
document.getElementById('gsDismiss').addEventListener('click', ()=>{
  try{ localStorage.setItem('hio-gs-dismissed', '1'); }catch(e){}
  document.getElementById('gettingStarted').hidden = true;
});
document.getElementById('gsImportBtn').addEventListener('click', ()=>{
  document.querySelector('.nav-tab[data-page="trips"]').click();
  openImportModal();
});
document.getElementById('gsGearBtn').addEventListener('click', ()=>{
  document.querySelector('.nav-tab[data-page="gear"]').click();
  openCatalogBrowser(null);
});
document.getElementById('gsSyncBtn').addEventListener('click', ()=> openCloudSignInModal());

// ---- Backup wiring (Settings) ----
let pendingBackup = null;
function setBackupStatus(msg, isError){
  const el = document.getElementById('backupStatus');
  el.textContent = msg; el.className = isError ? 'upload-error' : 'upload-status';
}
document.getElementById('backupDownloadBtn').addEventListener('click', async ()=>{
  const data = await buildBackup();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hike-in-one-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(a.href), 10000);
  setBackupStatus('Backup saved: ' + backupSummary(readBackup(data)) + '.');
});
document.getElementById('backupRestoreInput').addEventListener('change', async e=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  document.getElementById('backupConfirm').hidden = true;
  pendingBackup = null;
  try{
    pendingBackup = readBackup(JSON.parse(await file.text()));
  }catch(err){
    setBackupStatus(err instanceof SyntaxError ? 'That file isn\'t a Hike-in-one backup.' : err.message, true);
    return;
  }
  setBackupStatus('');
  document.getElementById('backupConfirmText').textContent =
    'This backup' + (pendingBackup.exportedAt ? ' from ' + friendlyDate(pendingBackup.exportedAt.slice(0, 10)) : '') +
    ' has ' + backupSummary(pendingBackup) + '. Restoring replaces everything on this device' +
    (cloudUser ? ' and in your synced account' : '') + '.';
  document.getElementById('backupConfirm').hidden = false;
});
document.getElementById('backupCancelBtn').addEventListener('click', ()=>{
  pendingBackup = null;
  document.getElementById('backupConfirm').hidden = true;
});
document.getElementById('backupConfirmBtn').addEventListener('click', async ()=>{
  if(!pendingBackup) return;
  const b = pendingBackup; pendingBackup = null;
  document.getElementById('backupConfirm').hidden = true;
  await restoreBackup(b);
  try{ refreshEverything(); }catch(err){ noteAppError(err); }
  try{ showGarage(); }catch(err){ noteAppError(err); }
  renderTripCards();
  setBackupStatus('Restored ' + backupSummary(b) + '.');
});

const CLEAR_LABEL = 'Remove all tracks and location history';
let clearArmed = false;
document.getElementById('clearBtn').addEventListener('click', async (e)=>{
  if(!clearArmed){
    clearArmed = true;
    e.target.textContent = 'Click again to confirm';
    setTimeout(()=>{ clearArmed=false; e.target.textContent=CLEAR_LABEL; }, 3000);
    return;
  }
  tracks = []; googlePoints = [];
  await saveTracks(); await saveGoogle();
  e.target.textContent = CLEAR_LABEL;
  clearArmed = false;
  refreshEverything();
});

// ---- Init ----
(async function init(){
  trackLayerGroup.addTo(map);
  const savedBasemap = await storeGet('waypoints-basemap');
  if(savedBasemap && ['dark','light','terrain','satellite'].includes(savedBasemap)){
    setBasemap(savedBasemap);
    document.querySelectorAll('#basemapToggle button').forEach(b=>{
      b.classList.toggle('active', b.dataset.basemap === savedBasemap);
    });
  }
  try{
    await loadAll();
    await loadGear();
    await loadTrips();
    await loadLoadouts();
  }catch(err){
    resolveLocalDataLoaded(false);
    throw err;
  }
  resolveLocalDataLoaded(true);
  showGarage();
  refreshEverything();
  if(tracks.length || googlePoints.length){
    const b = L.latLngBounds(allPoints());
    if(b.isValid()) map.fitBounds(b, {padding:[40,40]});
  }

  // showGarage() above (and anything else during init) must never push
  // history — it's warming up the gear view's DOM, not navigating —
  // appInitializing kept pushRouteState() a no-op until now. Establish
  // the one clean starting entry for whichever page is actually visible
  // (per the static HTML/CSS default, that's Map, not Gear).
  appInitializing = false;
  history.replaceState(currentRouteState(), '', location.pathname + location.search);

  // Backfill country tags for tracks saved before this feature existed.
  // Runs after first paint so it never blocks initial load.
  const missingCountries = tracks.filter(t=> t.countries === undefined);
  if(missingCountries.length){
    (async()=>{
      for(const t of missingCountries) await detectTrackCountries(t);
      await saveTracks();
      renderStats();
    })();
  }
})();

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  });
}
