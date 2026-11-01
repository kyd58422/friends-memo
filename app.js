const config = window.SUPABASE_CONFIG;
const loginForm = document.querySelector("#loginForm");
const loginButton = document.querySelector("#loginButton");
const logoutButton = document.querySelector("#logoutButton");
const userName = document.querySelector("#userName");
const loginMessage = document.querySelector("#loginMessage");
const memoForm = document.querySelector("#memoForm");
const memoTitle = document.querySelector("#memoTitle");
const memoContent = document.querySelector("#memoContent");
const addMemoButton = document.querySelector("#addMemoButton");
const editMemoButton = document.querySelector("#editMemoButton");
const loadMemoButton = document.querySelector("#loadMemoButton");
const memoList = document.querySelector("#memoList");
const emptyMemoMessage = document.querySelector("#emptyMemoMessage");
const memoMessage = document.querySelector("#memoMessage");
const memoListMessage = document.querySelector("#memoListMessage");
const permissionStatus = document.querySelector("#permissionStatus");

let supabaseClient = null;
const state = {
  session: null,
  memos: [],
  selectedMemoId: null,
  permissions: { canRead: false, canCreate: false, canUpdate: false, canDelete: false }
};

function isSupabaseConfigured() {
  return Boolean(config?.url?.trim() && config?.publishableKey?.trim());
}

function showMessage(element, message, type = "") {
  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

function resetPermissions() {
  state.permissions = { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
}

function updatePermissionControls() {
  addMemoButton.disabled = !state.permissions.canCreate;
  loadMemoButton.disabled = !state.permissions.canRead;
  editMemoButton.disabled = !state.permissions.canUpdate || !state.selectedMemoId;
}

function updatePermissionStatus() {
  const labels = [];
  if (state.permissions.canRead) labels.push("조회");
  if (state.permissions.canCreate) labels.push("추가");
  if (state.permissions.canUpdate) labels.push("수정");
  if (state.permissions.canDelete) labels.push("삭제");
  permissionStatus.textContent = labels.length
    ? `현재 내 권한: ${labels.join(", ")}`
    : "현재 사용할 수 있는 메모 권한이 없습니다.";
}

function showLoggedInScreen(session) {
  const isLoggedIn = Boolean(session?.user);
  document.body.classList.toggle("is-logged-in", isLoggedIn);
  if (isLoggedIn) {
    const user = session.user;
    userName.textContent = user.user_metadata?.name || user.email || "사용자";
    showMessage(loginMessage, "");
  } else {
    userName.textContent = "사용자 이름";
  }
}

async function loadPermissions() {
  const { data, error } = await supabaseClient
    .from("memo_permissions")
    .select("can_read, can_create, can_update, can_delete")
    .eq("user_id", state.session.user.id)
    .maybeSingle();

  if (error) {
    resetPermissions();
    updatePermissionControls();
    updatePermissionStatus();
    showMessage(memoListMessage, "권한 정보를 불러오지 못했습니다.", "error");
    return false;
  }

  state.permissions = {
    canRead: data?.can_read === true,
    canCreate: data?.can_create === true,
    canUpdate: data?.can_update === true,
    canDelete: data?.can_delete === true
  };
  updatePermissionControls();
  updatePermissionStatus();
  return true;
}

function clearMemoEditor() {
  memoForm.reset();
  state.selectedMemoId = null;
  updatePermissionControls();
}

function selectMemo(memo) {
  if (!state.permissions.canRead) return;
  state.selectedMemoId = memo.id;
  memoTitle.value = memo.title || "";
  memoContent.value = memo.content || "";
  updatePermissionControls();
  showMessage(memoMessage, "메모를 선택했습니다. 수정 권한이 있으면 내용을 바꾼 뒤 수정 버튼을 눌러 주세요.", "info");
  memoTitle.focus();
}

function renderMemos() {
  memoList.replaceChildren();
  emptyMemoMessage.hidden = state.memos.length > 0;

  state.memos.forEach((memo) => {
    const item = document.createElement("li");
    const article = document.createElement("article");
    const title = document.createElement("h3");
    const content = document.createElement("p");
    const meta = document.createElement("p");
    const actions = document.createElement("div");
    const viewButton = document.createElement("button");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    item.className = "memo-item";
    actions.className = "memo-actions";
    meta.className = "memo-meta";
    viewButton.className = "view-button";
    editButton.className = "edit-button";
    deleteButton.className = "delete-button";
    viewButton.type = editButton.type = deleteButton.type = "button";
    viewButton.textContent = "조회";
    editButton.textContent = "수정";
    deleteButton.textContent = "삭제";

    // textContent is used so memo text is never interpreted as HTML.
    title.textContent = memo.title || "제목 없음";
    content.textContent = memo.content || "내용 없음";
    meta.textContent = memo.created_at
      ? `작성일: ${new Date(memo.created_at).toLocaleString("ko-KR")}`
      : "작성일 정보 없음";

    viewButton.disabled = !state.permissions.canRead;
    editButton.disabled = !state.permissions.canUpdate;
    deleteButton.disabled = !state.permissions.canDelete;
    viewButton.addEventListener("click", () => selectMemo(memo));
    editButton.addEventListener("click", () => selectMemo(memo));
    deleteButton.addEventListener("click", () => deleteMemo(memo.id));

    actions.append(viewButton, editButton, deleteButton);
    article.append(title, content, meta, actions);
    item.append(article);
    memoList.append(item);
  });
}

async function loadMemos() {
  if (!state.session || !state.permissions.canRead) {
    state.memos = [];
    renderMemos();
    return;
  }

  loadMemoButton.disabled = true;
  showMessage(memoListMessage, "메모를 불러오는 중입니다.", "info");
  const { data, error } = await supabaseClient
    .from("memos")
    .select("id, title, content, created_by, created_at")
    .order("created_at", { ascending: false });
  updatePermissionControls();

  if (error) {
    showMessage(memoListMessage, "메모를 불러오지 못했습니다. 권한 또는 연결 상태를 확인해 주세요.", "error");
    return;
  }

  state.memos = data || [];
  renderMemos();
  showMessage(memoListMessage, "");
}

async function addMemo(event) {
  event.preventDefault();
  if (!state.permissions.canCreate || !state.session) {
    showMessage(memoMessage, "메모를 추가할 권한이 없습니다.", "error");
    return;
  }

  addMemoButton.disabled = true;
  const { error } = await supabaseClient.from("memos").insert({
    title: memoTitle.value.trim(),
    content: memoContent.value.trim(),
    created_by: state.session.user.id
  });
  updatePermissionControls();

  if (error) {
    showMessage(memoMessage, "메모를 추가하지 못했습니다. 입력 내용과 권한을 확인해 주세요.", "error");
    return;
  }
  clearMemoEditor();
  showMessage(memoMessage, "메모를 추가했습니다.", "info");
  await loadMemos();
}

async function updateMemo() {
  if (!state.permissions.canUpdate || !state.selectedMemoId) {
    showMessage(memoMessage, "수정할 메모를 먼저 선택해 주세요.", "error");
    return;
  }

  editMemoButton.disabled = true;
  const { error } = await supabaseClient
    .from("memos")
    .update({ title: memoTitle.value.trim(), content: memoContent.value.trim() })
    .eq("id", state.selectedMemoId);

  if (error) {
    updatePermissionControls();
    showMessage(memoMessage, "메모를 수정하지 못했습니다. 권한을 확인해 주세요.", "error");
    return;
  }
  clearMemoEditor();
  showMessage(memoMessage, "메모를 수정했습니다.", "info");
  await loadMemos();
}

async function deleteMemo(memoId) {
  if (!state.permissions.canDelete) {
    showMessage(memoListMessage, "메모를 삭제할 권한이 없습니다.", "error");
    return;
  }
  if (!window.confirm("이 메모를 삭제할까요?")) return;

  const { error } = await supabaseClient.from("memos").delete().eq("id", memoId);
  if (error) {
    showMessage(memoListMessage, "메모를 삭제하지 못했습니다. 권한을 확인해 주세요.", "error");
    return;
  }
  if (state.selectedMemoId === memoId) clearMemoEditor();
  showMessage(memoListMessage, "메모를 삭제했습니다.", "info");
  await loadMemos();
}

async function handleSessionChange(session) {
  state.session = session;
  showLoggedInScreen(session);
  if (!session) {
    resetPermissions();
    state.memos = [];
    state.selectedMemoId = null;
    renderMemos();
    updatePermissionControls();
    updatePermissionStatus();
    return;
  }
  clearMemoEditor();
  if (await loadPermissions()) await loadMemos();
}

async function handleLogin(event) {
  event.preventDefault();
  if (!supabaseClient) {
    showMessage(loginMessage, "config.js에 Supabase URL과 publishable key를 입력해 주세요.", "error");
    return;
  }
  loginButton.disabled = true;
  loginButton.textContent = "로그인 중...";
  showMessage(loginMessage, "");
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: document.querySelector("#email").value.trim(),
    password: document.querySelector("#password").value
  });
  loginButton.disabled = false;
  loginButton.textContent = "로그인";
  if (error) {
    showMessage(loginMessage, "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.", "error");
    return;
  }
  loginForm.reset();
}

async function handleLogout() {
  if (!supabaseClient) return;
  logoutButton.disabled = true;
  const { error } = await supabaseClient.auth.signOut();
  logoutButton.disabled = false;
  if (error) showMessage(loginMessage, "로그아웃 중 문제가 발생했습니다. 다시 시도해 주세요.", "error");
}

async function startApp() {
  if (!isSupabaseConfigured()) {
    showMessage(loginMessage, "config.js에 Supabase URL과 publishable key를 입력하면 로그인할 수 있습니다.", "info");
    return;
  }
  if (!window.supabase) {
    showMessage(loginMessage, "Supabase 연결 파일을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.", "error");
    return;
  }
  supabaseClient = window.supabase.createClient(config.url.trim(), config.publishableKey.trim());
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) showMessage(loginMessage, "로그인 상태를 확인하지 못했습니다. 새로고침 후 다시 시도해 주세요.", "error");
  else await handleSessionChange(data.session);
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    void handleSessionChange(session);
  });
}

loginForm.addEventListener("submit", handleLogin);
logoutButton.addEventListener("click", handleLogout);
memoForm.addEventListener("submit", addMemo);
editMemoButton.addEventListener("click", updateMemo);
loadMemoButton.addEventListener("click", loadMemos);
startApp();
