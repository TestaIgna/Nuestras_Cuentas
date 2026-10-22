
const $ = (id) => document.getElementById(id);

const today = new Date();
const localDate = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0")
].join("-");

$("dateInput").value = localDate;

const money = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2
  }).format(n);

const dateFormat = (value) => {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
};


function formatAmount(value) {
  let raw = String(value).replace(/[^\d,]/g, "");
  const parts = raw.split(",");
  const integerPart = parts[0].replace(/\D/g, "");
  const decimals = parts.length > 1
    ? "," + parts.slice(1).join("").slice(0, 2)
    : "";

  const formattedInteger = integerPart.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    "."
  );

  return formattedInteger + decimals;
}

function parseAmount(value) {
  const normalized = String(value)
    .replace(/\./g, "")
    .replace(",", ".");
  return Number(normalized);
}

$("amountInput").addEventListener("input", event => {
  const input = event.target;
  input.value = formatAmount(input.value);
});


// Adaptamos los nombres del backend a los de la interfaz.
const fromApi = (e) => ({
  id: e.id,
  description: e.description,
  amount: Number(e.amount),
  paidBy: e.paid_by,
  date: e.date
});

const toApi = (e) => ({
  description: e.description.trim(),
  amount: Number(e.amount),
  paid_by: e.paidBy,
  date: e.date
});

let expenses = [];
let archives = [];
let busy = false;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    let message = `Error HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail || data);
    } catch (_) {}
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function loadData() {
  try {
    const [expenseData, archiveData] = await Promise.all([
      api("/api/expenses"),
      api("/api/months")
    ]);

    expenses = expenseData.map(fromApi);
    archives = archiveData.map(a => ({
      id: a.id,
      name: a.name,
      closedDate: a.closed_date,
      createdAt: a.created_at,
      expenses: (a.expenses || []).map(fromApi)
    }));

    render();
  } catch (error) {
    console.error(error);
    alert(
      "No se pudieron cargar los datos. Verificá que el servidor esté funcionando.\n\n" +
      error.message
    );
  }
}

function calculate(items) {
  const you = items
    .filter(e => e.paidBy === "you")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const partner = items
    .filter(e => e.paidBy === "partner")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return { you, partner, total: you + partner, diff: you - partner };
}

function render() {
  const { you, partner, total, diff } = calculate(expenses);

  $("total").textContent = money(total);
  $("paidYou").textContent = money(you);
  $("paidPartner").textContent = money(partner);
  $("count").textContent =
    `${expenses.length} ${expenses.length === 1 ? "gasto registrado" : "gastos registrados"}`;

  if (Math.abs(diff) < 0.005) {
    $("balanceMain").textContent = "Están a mano ✓";
    $("balanceDetail").textContent = total === 0
      ? "Cuando carguen gastos, acá verán quién tiene que compensar a quién."
      : "Los dos pagaron lo mismo. No hace falta transferir nada.";
  } else if (diff < 0) {
    $("balanceMain").textContent =
      `Igna le debe ${money(Math.abs(diff) / 2)} a Orne`;
    $("balanceDetail").textContent =
      "Igna le transfiere ese importe a Orne para quedar a mano.";
  } else {
    $("balanceMain").textContent =
      `Orne le debe ${money(diff / 2)} a Igna`;
    $("balanceDetail").textContent =
      "Orne le transfiere ese importe a Igna y quedan a mano.";
  }

  renderExpenses();
  renderArchives();
}

function renderExpenses() {
  const list = $("expenseList");
  list.replaceChildren();

  if (!expenses.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Todavía no hay gastos. Agregá el primero desde el formulario.";
    list.appendChild(empty);
    return;
  }

  [...expenses]
    .sort((a, b) =>
      (b.date || "").localeCompare(a.date || "") || b.id - a.id
    )
    .forEach(e => {
      const item = document.createElement("div");
      item.className = "expense";

      const icon = document.createElement("div");
      icon.className = "expense-icon";
      icon.textContent = "↗";

      const info = document.createElement("div");
      info.className = "expense-info";

      const name = document.createElement("div");
      name.className = "expense-name";
      name.textContent = e.description;

      const meta = document.createElement("div");
      meta.className = "expense-meta";
      meta.textContent =
        `${e.paidBy === "you" ? "Pagó Igna" : "Pagó Orne"} · ${dateFormat(e.date)}`;

      info.append(name, meta);

      const right = document.createElement("div");
      right.className = "expense-right";

      const amount = document.createElement("div");
      amount.className = "expense-amount";
      amount.textContent = money(e.amount);

      const edit = document.createElement("button");
      edit.className = "edit-btn";
      edit.type = "button";
      edit.textContent = "Editar";

      edit.addEventListener("click", () => {
        $("description").value = e.description;
        $("amountInput").value = formatAmount(e.amount);
        $("paidBy").value = e.paidBy;
        $("dateInput").value = e.date || localDate;
        $("expenseForm").dataset.editingId = String(e.id);
        $("expenseForm").querySelector('[type="submit"]').textContent =
            "Guardar cambios";
        $("expenseForm").scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
        $("description").focus();
        });

      const del = document.createElement("button");
      del.className = "delete-btn";
      del.type = "button";
      del.textContent = "✕";
      del.title = "Eliminar gasto";

      del.addEventListener("click", async () => {
        if (!confirm(`¿Eliminar el gasto "${e.description}"?`)) return;

        try {
          await api(`/api/expenses/${e.id}`, { method: "DELETE" });
          await loadData();
        } catch (error) {
          alert("No se pudo eliminar el gasto: " + error.message);
        }
      });

      right.append(amount, edit, del);
      item.append(icon, info, right);
      list.appendChild(item);
    });
}

function renderArchives() {
  const list = $("archiveList");
  list.replaceChildren();

  if (!archives.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Todavía no cerraron ningún mes.";
    list.appendChild(empty);
    return;
  }

  [...archives]
    .sort((a, b) => b.id - a.id)
    .forEach(archive => {
      const card = document.createElement("div");
      card.className = "archive-card";

      const title = document.createElement("div");
      title.className = "archive-title";
      title.textContent = archive.name;

      const { you, partner, total, diff } = calculate(archive.expenses);

      const meta = document.createElement("div");
      meta.className = "archive-meta";
      meta.textContent =
        `Cerrado el ${dateFormat(archive.closedDate)} · ` +
        `${archive.expenses.length} gastos · Total ${money(total)} · ` +
        `Igna pagó ${money(you)} · Orne pagó ${money(partner)}`;

      const balance = document.createElement("div");
      balance.className = "archive-meta";

      if (Math.abs(diff) < 0.005) {
        balance.textContent = "Saldo: quedaron a mano.";
      } else if (diff < 0) {
        balance.textContent =
          `Saldo: Igna le debía ${money(Math.abs(diff) / 2)} a Orne.`;
      } else {
        balance.textContent =
          `Saldo: Orne le debía ${money(diff / 2)} a Igna.`;
      }

      const details = document.createElement("details");
      details.className = "archive-detail";

      const summary = document.createElement("summary");
      summary.textContent = "Ver gastos guardados";
      details.appendChild(summary);

      if (!archive.expenses.length) {
        const empty = document.createElement("div");
        empty.className = "archive-meta";
        empty.textContent = "Este mes se cerró sin gastos.";
        details.appendChild(empty);
      }

      [...archive.expenses]
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .forEach(e => {
          const row = document.createElement("div");
          row.className = "archive-expense";

          const desc = document.createElement("span");
          desc.textContent =
            `${e.description} · ${e.paidBy === "you" ? "Pagó Igna" : "Pagó Orne"} · ${dateFormat(e.date)}`;

          const amount = document.createElement("strong");
          amount.textContent = money(e.amount);

          row.append(desc, amount);
          details.appendChild(row);
        });

      card.append(title, meta, balance, details);
      list.appendChild(card);
    });
}

// Registrar o editar gastos.
$("expenseForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;

  const expense = {
    description: $("description").value.trim(),
    amount: parseAmount($("amountInput").value),
    paidBy: $("paidBy").value,
    date: $("dateInput").value
  };

  if (
    !expense.description ||
    !Number.isFinite(expense.amount) ||
    expense.amount <= 0 ||
    !expense.date
  ) return;

  const editingId = $("expenseForm").dataset.editingId;
  busy = true;

  try {
    await api(
      editingId ? `/api/expenses/${editingId}` : "/api/expenses",
      {
        method: editingId ? "PUT" : "POST",
        body: JSON.stringify(toApi(expense))
      }
    );

    delete $("expenseForm").dataset.editingId;
    $("expenseForm").reset();
    $("dateInput").value = localDate;
    $("expenseForm").querySelector('[type="submit"]').textContent =
        "＋ Registrar gasto";

    // Volver a habilitar los botones de eliminar.
    document.querySelectorAll(".delete-btn").forEach(button => {
        button.disabled = false;
        button.title = "Eliminar gasto";
    });

    await loadData();
    $("description").focus();
  } catch (error) {
    alert("No se pudo guardar el gasto: " + error.message);
  } finally {
    busy = false;
  }
});

// Abrir y cancelar el cierre mensual.
$("closeMonthBtn").addEventListener("click", () => {
  $("monthName").value = "";
  $("closeMonthModal").classList.add("open");
  $("monthName").focus();
});

$("cancelCloseMonth").addEventListener("click", () => {
  $("closeMonthModal").classList.remove("open");
});

$("closeMonthModal").addEventListener("click", event => {
  if (event.target === $("closeMonthModal")) {
    $("closeMonthModal").classList.remove("open");
  }
});

// Guardar el cierre en el servidor.
$("closeMonthForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;

  const name = $("monthName").value.trim();
  if (!name) return;

  if (!confirm(
    `¿Cerrar "${name}"? Se archivarán los ${expenses.length} gastos activos y la lista quedará vacía.`
  )) return;

  busy = true;

  try {
    await api("/api/months/close", {
      method: "POST",
      body: JSON.stringify({ name })
    });

    $("closeMonthModal").classList.remove("open");
    delete $("expenseForm").dataset.editingId;
    $("expenseForm").reset();
    $("dateInput").value = localDate;
    $("expenseForm").querySelector('[type="submit"]').textContent =
      "＋ Registrar gasto";

    await loadData();
    alert("Mes cerrado y guardado correctamente.");
  } catch (error) {
    alert("No se pudo cerrar el mes: " + error.message);
  } finally {
    busy = false;
  }
});

// Exportar los gastos activos a un archivo JSON.
$("exportBtn").addEventListener("click", () => {
  const data = expenses.map(e => ({
    id: e.id,
    description: e.description,
    amount: e.amount,
    paidBy: e.paidBy,
    date: e.date
  }));

  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gastos-compartidos.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Importar gastos al servidor, sin modificar los existentes.
$("importBtn").addEventListener("click", () => $("importFile").click());

$("importFile").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());

    if (
      !Array.isArray(parsed) ||
      parsed.some(e =>
        !e ||
        typeof e.description !== "string" ||
        !Number.isFinite(Number(e.amount)) ||
        Number(e.amount) <= 0 ||
        !["you", "partner"].includes(e.paidBy) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")
      )
    ) {
      throw new Error("El archivo no tiene el formato esperado.");
    }

    if (!confirm(
      `Se agregarán ${parsed.length} gastos a los que ya existen. ¿Continuar?`
    )) return;

    for (const e of parsed) {
      await api("/api/expenses", {
        method: "POST",
        body: JSON.stringify(toApi(e))
      });
    }

    await loadData();
    alert("Importación finalizada.");
  } catch (error) {
    alert("No se pudo completar la importación: " + error.message);
    await loadData();
  } finally {
    event.target.value = "";
  }
});

// Arrancar la interfaz cargando los datos desde la API.
loadData();
