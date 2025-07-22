const {
  createBot,
  createProvider,
  createFlow,
  addKeyword,
} = require("@bot-whatsapp/bot");

const QRPortalWeb = require("@bot-whatsapp/portal");
const BaileysProvider = require("@bot-whatsapp/provider/baileys");
const MockAdapter = require("@bot-whatsapp/database/mock");
const axios = require("axios");

// AppSheet configuración
const APPSHEET_CLIENTES_URL =
  "https://api.appsheet.com/api/v2/apps/4fdb14d3-c7fd-43ff-b5e5-e41986a63953/tables/CLIENTES/Action";
const APPSHEET_FUNCIONARIOS_URL =
  "https://api.appsheet.com/api/v2/apps/4fdb14d3-c7fd-43ff-b5e5-e41986a63953/tables/FUNCIONARIOS/Action";
const APPSHEET_CITAS_URL =
  "https://api.appsheet.com/api/v2/apps/4fdb14d3-c7fd-43ff-b5e5-e41986a63953/tables/CITAS/Action";
const APPSHEET_SERVICIOS_URL =
  "https://api.appsheet.com/api/v2/apps/4fdb14d3-c7fd-43ff-b5e5-e41986a63953/tables/SERVICIOS/Action";
const APPSHEET_API_KEY = "V2-CcNtG-aEtuK-a4BmO-y4MAg-ZOKy2-Gua3l-vcImp-BmY0I";

// =====================================
// Flujo para REGISTRAR CLIENTE
// =====================================
const flowRegistrarCliente = addKeyword(["[]"])
  .addAnswer(
    "¿Cuál es tu nombre completo?",
    { capture: true },
    async (ctx, { state }) => {
      await state.update({ nombreCliente: ctx.body.trim() });
    }
  )
  .addAnswer(
    "¿Cuál es tu dirección?",
    { capture: true },
    async (ctx, { state }) => {
      await state.update({ direccion: ctx.body.trim() });
    }
  )
  .addAnswer(
    "¿Cuál es tu email?",
    { capture: true },
    async (ctx, { state }) => {
      await state.update({ email: ctx.body.trim() });
    }
  )
  .addAnswer(
    "¿Cuál es tu número de teléfono?",
    { capture: true },
    async (ctx, { state, flowDynamic, gotoFlow }) => {
      const telefono = ctx.body.trim();
      const { cedulaCliente, nombreCliente, direccion, email } =
        await state.getMyState();

      try {
        await axios.post(
          APPSHEET_CLIENTES_URL,
          {
            Action: "Add",
            Properties: { Locale: "es-ES" },
            Rows: [
              {
                IdCliente: cedulaCliente,
                "Nombre Completo": nombreCliente,
                Dirección: direccion,
                Email: email,
                Teléfono: telefono,
              },
            ],
          },
          { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
        );

        await flowDynamic("✅ Cliente registrado correctamente.");

        const { debeContinuarCita } = await state.getMyState();
        if (debeContinuarCita) {
          await state.update({ debeContinuarCita: false });
          return gotoFlow(flowCitaContinuacion);
        } else {
          await flowDynamic(
            "¡Ahora puedes escribir *CITA* para agendar tu cita cuando desees!"
          );
        }
      } catch (err) {
        console.error(
          "🚨 Error registrando cliente:",
          err.response?.data || err.message
        );
        await flowDynamic("❌ Error al registrar el cliente.");
      }
    }
  );

const flowCita = addKeyword(["cita"]).addAnswer(
  "Perfecto, ¿Cuál es tu número de identificación?",
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    const cedula = ctx.body.trim();
    await state.update({ cedulaCliente: cedula });

    try {
      const response = await axios.post(
        APPSHEET_CLIENTES_URL,
        {
          Action: "Find",
          Properties: { Locale: "es-ES" },
        },
        { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
      );

      const cliente = response.data?.find((c) => c.IdCliente == cedula);

      if (!cliente) {
        await flowDynamic(
          `🔎 No encontramos un registro con el número de identificación *${cedula}*.\n\nSi deseas *registrarte*, escribe *SI*.\n\nSi el número es incorrecto y quieres intentarlo de nuevo, escribe *CORREGIR*.`
        );
        await state.update({ debeContinuarCita: true });
        return gotoFlow(flowConfirmarRegistroOCorregir);
      } else {
        await state.update({ nombreCliente: cliente["Nombre Completo"] });
        await flowDynamic(
          `Hola ${cliente["Nombre Completo"]}, continuemos con la cita.`
        );
        return gotoFlow(flowCitaContinuacion);
      }
    } catch (err) {
      console.error(
        "🚨 Error validando cliente:",
        err.response?.data || err.message
      );
      await flowDynamic("❌ Error consultando cliente.");
    }
  }
);

// =====================================
// Flujo para confirmar registro o corregir después de no encontrar cliente
// =====================================
const flowConfirmarRegistroOCorregir = addKeyword(["si", "corregir"]).addAnswer(
  "...",
  null,
  async (ctx, { gotoFlow, state }) => {
    const respuesta = ctx.body.trim().toLowerCase();
    if (respuesta === "si") {
      return gotoFlow(flowRegistrarCliente);
    } else if (respuesta === "corregir") {
      return gotoFlow(flowCita);
    }
  }
);

// =====================================
// Flujo para CONTINUAR CITA (funcionario)
// =====================================
const flowCitaContinuacion = addKeyword(["[]"])
  .addAnswer(
    "Ahora voy a mostrarte los funcionarios disponibles...",
    null,
    async (_, { state, flowDynamic }) => {
      try {
        const response = await axios.post(
          APPSHEET_FUNCIONARIOS_URL,
          {
            Action: "Find",
            Properties: { Locale: "es-ES" },
          },
          { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
        );

        const funcionarios = response.data || [];
        await state.update({ listaFuncionarios: funcionarios });

        const lista = funcionarios
          .map((f, i) => `${i + 1}) ${f["Nombre Completo"]}`)
          .join("\n");
        await flowDynamic(`Selecciona el número del funcionario:\n${lista}`);
      } catch (err) {
        console.error(
          "🚨 Error consultando funcionarios:",
          err.response?.data || err.message
        );
        await flowDynamic("❌ No pude obtener los funcionarios.");
      }
    }
  )
  .addAnswer(
    "¿Cuál número eliges?",
    { capture: true },
    async (ctx, { state, flowDynamic, gotoFlow }) => {
      const opcion = parseInt(ctx.body.trim());
      const { listaFuncionarios } = await state.getMyState();

      if (listaFuncionarios[opcion - 1]) {
        const funcionario = listaFuncionarios[opcion - 1];
        await state.update({
          funcionarioId: funcionario.IdFuncionario,
          funcionarioNombre: funcionario["Nombre Completo"],
        });
        await flowDynamic(`👍 Elegiste a ${funcionario["Nombre Completo"]}`);
        return gotoFlow(flowServicios);
      } else {
        await flowDynamic("❌ Opción inválida, volvamos a intentarlo.");
        return gotoFlow(flowCitaContinuacion);
      }
    }
  );

// =====================================
// Flujo para preguntar FECHA / HORA
// =====================================
const flowFechaHora = addKeyword(["[]"]).addAnswer(
  "Por favor indica la fecha y hora en formato DD/MM/YYYY HH:MM (por ejemplo, 22/07/2025 8:30 o 08:30)",
  { capture: true },
  async (ctx, { state, flowDynamic, gotoFlow }) => {
    const fechaHora = ctx.body.trim();
    
    const regexFechaHora = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;
    const match = fechaHora.match(regexFechaHora);

    if (!match) {
      await flowDynamic(
        "⚠️ Formato incorrecto. Debes escribir como: 22/07/2025 8:30 o 08:30"
      );
      return gotoFlow(flowFechaHora);
    }

    const [_, dia, mes, anio, hora, minutos] = match;

    const horaFinal = hora.padStart(2, "0");
    const minutosFinal = minutos.padStart(2, "0");
    const fechaHoraInicio = `${anio}-${mes.padStart(2, "0")}-${dia.padStart(
      2,
      "0"
    )}T${horaFinal}:00`;
    const inicioNuevaCita = new Date(fechaHoraInicio);

    const { funcionarioId, servicioId, listaServicios } =
      await state.getMyState();
    const servicio = listaServicios.find((s) => s.IdServicio === servicioId);
    const duracionMin = parseInt(servicio?.["Duración Minutos"] || "0");
    const finNuevaCita = new Date(
      inicioNuevaCita.getTime() + duracionMin * 60000
    );

    await state.update({ fechaHoraInicio: fechaHoraInicio });

    try {
      const response = await axios.post(
        APPSHEET_CITAS_URL,
        {
          Action: "Find",
          Properties: { Locale: "es-ES" },
        },
        { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
      );

      const citasFuncionario = response.data?.filter(
        (c) =>
          c.Funcionario === funcionarioId &&
          new Date(c.FechaHoraInicio).toDateString() ===
            inicioNuevaCita.toDateString() &&
          c.Estado === "Agendada"
      );

      // Verificar si hay traslapes con la nueva cita
      const traslapeEncontrado = citasFuncionario.some((cita) => {
        const inicioExistente = new Date(cita.FechaHoraInicio);
        const finExistente = new Date(cita.FechaHoraFin);
        return inicioNuevaCita < finExistente && finNuevaCita > inicioExistente;
      });

      // Si hay traslape, mostrar todas las citas del día para ese funcionario con estado "Agendada"
      if (traslapeEncontrado) {
        let mensaje =
          "⚠️ El funcionario ya tiene citas agendadas este día:\n\n";

        for (const cita of citasFuncionario) {
          const ini = new Date(cita.FechaHoraInicio);
          const fin = new Date(cita.FechaHoraFin);
          const format = (date) =>
            `${String(date.getHours()).padStart(2, "0")}:${String(
              date.getMinutes()
            ).padStart(2, "0")}`;
          mensaje += `🗓️ ${ini.toLocaleDateString()} 🕓 ${format(
            ini
          )} - ${format(fin)} (Estado: ${cita.Estado})\n`;
        }

        mensaje += "\nPor favor elige otro horario.";
        await flowDynamic(mensaje);
        return gotoFlow(flowFechaHora);
      }

      return gotoFlow(flowResumenCita);
    } catch (err) {
      console.error(
        "🚨 Error validando traslapes:",
        err.response?.data || err.message
      );
      await flowDynamic("❌ Error al validar el horario. Intenta de nuevo.");
      return gotoFlow(flowFechaHora);
    }
  }
);

// =====================================
// Flujo para elegir SERVICIO y REGISTRAR CITA
// =====================================
const flowServicios = addKeyword(["[]"])
  .addAnswer(
    "Ahora voy a mostrarte los servicios disponibles...",
    null,
    async (_, { state, flowDynamic }) => {
      try {
        const response = await axios.post(
          APPSHEET_SERVICIOS_URL,
          {
            Action: "Find",
            Properties: { Locale: "es-ES" },
          },
          { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
        );

        const servicios = response.data || [];
        await state.update({ listaServicios: servicios });

        const lista = servicios
          .map(
            (s, i) =>
              `${i + 1}) ${s["Nombre Servicio"]} - ${
                s["Duración Minutos"]
              } - $${s["Precio"]}`
          )
          .join("\n");

        await flowDynamic(`Selecciona el número del servicio:\n${lista}`);
      } catch (err) {
        console.error(
          "🚨 Error consultando servicios:",
          err.response?.data || err.message
        );
        await flowDynamic("❌ No pude obtener los servicios.");
      }
    }
  )
  .addAnswer(
    "¿Cuál número eliges?",
    { capture: true },
    async (ctx, { state, flowDynamic, gotoFlow }) => {
      const opcion = parseInt(ctx.body.trim());
      const { listaServicios } = await state.getMyState();

      if (listaServicios[opcion - 1]) {
        const servicio = listaServicios[opcion - 1];
        await state.update({
          servicioId: servicio.IdServicio,
          servicioNombre: servicio["Nombre Servicio"],
        });
        await flowDynamic(
          `👍 Elegiste el servicio: ${servicio["Nombre Servicio"]}`
        );
        return gotoFlow(flowFechaHora);
      } else {
        await flowDynamic("❌ Opción inválida, volvamos a intentarlo.");
        return gotoFlow(flowServicios);
      }
    }
  );

const flowResumenCita = addKeyword(["[]"]).addAnswer(
  "Perfecto, revisemos tu cita antes de confirmarla...",
  null,
  async (_, { state, flowDynamic, gotoFlow }) => {
    const {
      nombreCliente,
      funcionarioNombre,
      fechaHoraInicio,
      servicioNombre,
    } = await state.getMyState();
    await flowDynamic(
      `📋 *Detalles de tu cita:*\n\n` +
        `👤 Cliente: ${nombreCliente}\n` +
        `💇 Funcionario: ${funcionarioNombre}\n` +
        `🕑 Fecha y hora: ${fechaHoraInicio}\n` +
        `✂️ Servicio: ${servicioNombre}\n\n` +
        `👉 Escribe *CONFIRMAR* para registrar la cita o *CANCELAR* para salir.`
    );
  }
);

const flowConfirmarCita = addKeyword(["CONFIRMAR"]).addAnswer(
  "Registrando tu cita...",
  null,
  async (_, { state, flowDynamic }) => {
    const {
      cedulaCliente,
      funcionarioId,
      funcionarioNombre,
      fechaHoraInicio,
      servicioId,
      servicioNombre,
    } = await state.getMyState();

    try {
      await axios.post(
        APPSHEET_CITAS_URL,
        {
          Action: "Add",
          Properties: { Locale: "es-ES" },
          Rows: [
            {
              Cliente: cedulaCliente,
              Funcionario: funcionarioId,
              FechaHoraInicio: fechaHoraInicio,
              Servicio: servicioId,
            },
          ],
        },
        { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
      );

      await flowDynamic(
        `✅ *Cita registrada para ${fechaHoraInicio} con ${funcionarioNombre} para el servicio ${servicioNombre}.* ¡Gracias por preferirnos!`
      );
    } catch (err) {
      console.error(
        "🚨 Error agendando cita:",
        err.response?.data || err.message
      );
      await flowDynamic("❌ Hubo un problema registrando la cita.");
    }
  }
);

// =====================================
// Flujo de consulta estado cita
// =====================================
const flowConsulta = addKeyword(["estado", "consultar"]).addAnswer(
  "Por favor indica el número de identificación del cliente para consultar tus citas:",
  { capture: true },
  async (ctx, { flowDynamic }) => {
    const cedulaCliente = ctx.body.trim();
    try {
      // Consultas simultáneas
      const [citasRes, clientesRes, funcionariosRes, serviciosRes] =
        await Promise.all([
          axios.post(
            APPSHEET_CITAS_URL,
            {
              Action: "Find",
              Properties: { Locale: "es-ES" },
            },
            { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
          ),
          axios.post(
            APPSHEET_CLIENTES_URL,
            {
              Action: "Find",
              Properties: { Locale: "es-ES" },
            },
            { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
          ),
          axios.post(
            APPSHEET_FUNCIONARIOS_URL,
            {
              Action: "Find",
              Properties: { Locale: "es-ES" },
            },
            { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
          ),
          axios.post(
            APPSHEET_SERVICIOS_URL,
            {
              Action: "Find",
              Properties: { Locale: "es-ES" },
            },
            { headers: { ApplicationAccessKey: APPSHEET_API_KEY } }
          ),
        ]);

      // Filtrar solo citas agendadas del cliente
      const citas = citasRes.data?.filter(
        (row) =>
          row["Cliente"] === cedulaCliente && row["Estado"] === "Agendada"
      );

      if (citas && citas.length > 0) {
        // Ordenar por FechaHoraInicio
        citas.sort(
          (a, b) => new Date(a.FechaHoraInicio) - new Date(b.FechaHoraInicio)
        );

        // Nombre del cliente
        const cliente = clientesRes.data?.find(
          (c) => c["IdCliente"] === cedulaCliente
        );
        const nombreCliente = cliente?.["Nombre Completo"] || cedulaCliente;

        // Función para formatear fecha
        const formatearFecha = (fechaStr) => {
          const fecha = new Date(fechaStr);
          const dia = String(fecha.getDate()).padStart(2, "0");
          const mes = String(fecha.getMonth() + 1).padStart(2, "0");
          const anio = fecha.getFullYear();
          const horas = String(fecha.getHours()).padStart(2, "0");
          const minutos = String(fecha.getMinutes()).padStart(2, "0");
          return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
        };

        let mensaje = `📋 *Citas agendadas de ${nombreCliente}*\n\n`;

        for (const cita of citas) {
          const funcionario = funcionariosRes.data?.find(
            (f) => f["IdFuncionario"] === cita["Funcionario"]
          );
          const nombreFuncionario =
            funcionario?.["Nombre Completo"] || cita["Funcionario"];

          const servicio = serviciosRes.data?.find(
            (s) => s["IdServicio"] === cita["Servicio"]
          );
          const nombreServicio =
            servicio?.["Nombre Servicio"] || cita["Servicio"];
          const duracion = servicio?.["Duración Minutos"] || "-";
          const precio =
            servicio?.["Precio"] != null ? `$${servicio["Precio"]}` : "-";

          mensaje += `📄 *Número de Cita:* ${cita["IdCita"]}\n`;
          mensaje += `💇 *Funcionario:* ${nombreFuncionario}\n`;
          mensaje += `🕑 *Fecha y hora inicio:* ${formatearFecha(
            cita["FechaHoraInicio"]
          )}\n`;
          mensaje += `✂ *Servicio:* ${nombreServicio}\n`;
          mensaje += `🕑 *Duración:* ${duracion} minutos\n`;
          mensaje += `💲 *Precio:* ${precio}\n`;
          mensaje += `🕓 *Fecha y hora fin:* ${formatearFecha(
            cita["FechaHoraFin"]
          )}\n`;
          mensaje += `📌 *Estado:* ${cita["Estado"]}\n\n`;
        }

        mensaje += `🔁 Si deseas *agendar* o *consultar* otra cita, escribe la palabra *HOLA*.`;

        await flowDynamic(mensaje.trim());
      } else {
        await flowDynamic(
          "⚠️ No encontramos citas *Agendadas* para este número de identificación."
        );
      }
    } catch (err) {
      console.error(
        "🚨 Error consultando cita:",
        err.response?.data || err.message
      );
      await flowDynamic("❌ Error al consultar tus citas. Intenta más tarde.");
    }
  }
);

// =====================================
// Flujo principal y bot
// =====================================
const flowApp = addKeyword(["app"]).addAnswer(
  "Visítanos en https://www.appsheet.com/start/4fdb14d3-c7fd-43ff-b5e5-e41986a63953"
);

const flowPrincipal = addKeyword(["hola", "buenas", "ole", "alo"])
  .addAnswer("👋 Bienvenido a Barber and Styles. ¿Qué deseas hacer?")
  .addAnswer(
    [
      "📝 Escribe *CITA* para agendar una cita.",
      "🔎 Escribe *CONSULTAR* para consultar una cita.",
      "🌐 Escribe *APP* para ir a nuestra web.",
    ],
    null,
    null,
    [flowApp, flowCita, flowConsulta, flowRegistrarCliente]
  );

const main = async () => {
  const adapterDB = new MockAdapter();
  const adapterFlow = createFlow([
    flowPrincipal,
    flowConfirmarRegistroOCorregir,
    flowCita,
    flowRegistrarCliente,
    flowCitaContinuacion,
    flowServicios,
    flowFechaHora,
    flowResumenCita,
    flowConfirmarCita,
  ]);
  const adapterProvider = createProvider(BaileysProvider);

  createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  QRPortalWeb();
};

main();
