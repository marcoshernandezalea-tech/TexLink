# Hoja de leads de TexLink

Google Sheet: **Campaña 2 TexLink**
`https://docs.google.com/spreadsheets/d/1K2GU2CoNOh4ohPn7hxpylPdcSSO5O1CdKo-89mMi2Mg/edit`

Tres pestañas:

| Pestaña | Para qué sirve |
|---|---|
| `Seguimiento de Leads` | La hoja de trabajo. Es la única que se edita a diario. |
| `Criterios` | Los puntos que calculan la prioridad y las listas de los desplegables. |
| `Origen Meta 2026-10-13` | El export crudo del formulario de Meta. No se toca: es la prueba de qué contestó cada lead. |

## Seguimiento de Leads

Filas 2 a 4: panel de control. Fila 6: cabeceras. Los leads empiezan en la fila 7.
Se congelan las 6 primeras filas y las columnas A, B y C, para que el nombre
siga visible al desplazarse a la derecha.

### Panel de control (D3:J3)

Todo son fórmulas con rangos abiertos, así que cuentan los leads nuevos sin tocar nada.

| Celda | Indicador | Fórmula |
|---|---|---|
| D3 | Total leads | `=COUNTA($C$7:$C)` |
| E3 | Sin contactar | `=COUNTIF($M$7:$M;"Nuevo")` |
| F3 | En contacto | `=COUNTIF($M$7:$M;"En contacto")` |
| G3 | Reuniones | `=COUNTIF($M$7:$M;"Reunión")` |
| H3 | Ganados | `=COUNTIF($M$7:$M;"Ganado")` |
| I3 | % contacto | `=IF($D$3=0;0;($D$3-$E$3)/$D$3)` |
| J3 | Prioridad media | `=IFERROR(ROUND(AVERAGE($L$7:$L);0);0)` |

### Columnas

| Col | Cabecera | Notas |
|---|---|---|
| B | FECHA ALTA | Fecha en que entró el lead. Formato dd/mm/aaaa. |
| C | NOMBRE | Persona de contacto. |
| D | MARCA | Marca o proyecto del lead. |
| E | PLATAFORMA | Instagram o Facebook. |
| F | ANUNCIO | Creatividad de Meta que trajo el lead (`V1_Marcos`, `V2_Lucas`, `V3_Marcos_Y_Lucas`). |
| G | TIPO DE PROYECTO | Desplegable. Alimenta la prioridad. |
| H | UNIDADES | Desplegable. Alimenta la prioridad. |
| I | PRESUPUESTO | Desplegable. Alimenta la prioridad. |
| J | TECH PACK | Desplegable. Alimenta la prioridad. |
| K | WEB / IG | Lo que el lead escribió en el formulario. |
| L | PRIORIDAD | Fórmula. 0 a 100. Verde desde 60, ámbar desde 40, rojo por debajo. |
| M | ESTADO | Desplegable con las 7 fases del embudo. Mueve los contadores del panel. |
| N | CONTACTADO | Casilla de verificación. |
| O | RESPONSABLE | Desplegable. Sin asignar todavía. |
| P | ÚLTIMO CONTACTO | Fecha. Alimenta DÍAS SIN CONTACTO. |
| Q | PRÓXIMA ACCIÓN | Texto libre. |
| R | FECHA PRÓX. ACCIÓN | Fecha. |
| S | DÍAS SIN CONTACTO | Fórmula. Se pone en rojo pasados 7 días si el lead sigue abierto. |
| T | CORREO | |
| U | TELÉFONO | Guardado como texto para no perder el `+34`. |
| V | TEL. VERIFICADO | Viene de Meta. En rojo si es FALSE. |
| W | CIUDAD | |
| X | PROVEEDOR | Desplegable: TexLink ES o TexLink PT. |
| Y | NOTAS | |

### Fórmulas por fila

Rellenadas hasta la fila 100, así que un lead nuevo se puntúa solo.

**Prioridad (L7)** suma los puntos de las cuatro tablas de `Criterios`:

```
=IF($C7="";"";
  XLOOKUP($I7;Criterios!$B$7:$B$11;Criterios!$C$7:$C$11;0)+
  XLOOKUP($H7;Criterios!$B$14:$B$17;Criterios!$C$14:$C$17;0)+
  XLOOKUP($J7;Criterios!$B$20:$B$22;Criterios!$C$20:$C$22;0)+
  XLOOKUP($G7;Criterios!$B$25:$B$26;Criterios!$C$25:$C$26;0))
```

**Días sin contacto (S7)**, cuenta desde el último contacto o, si no hay, desde el alta:

```
=IF($C7="";"";TODAY()-IF($P7="";$B7;$P7))
```

## Criterios

Las celdas con fondo amarillo son las editables. Cambiar un número recalcula
todas las puntuaciones. Máximo posible: 100 puntos (40 presupuesto + 30
unidades + 20 tech pack + 10 tipo de proyecto).

Los umbrales de color de la prioridad están en C31 (alta, 60) y C32 (media, 40).
Las reglas de formato condicional los leen con `INDIRECT`, porque Google Sheets
no admite referencias directas a otra pestaña dentro de una regla de color.

De B35 a B49 están las listas que alimentan los desplegables: estados del
embudo, responsables y proveedores. Añadir una fila a una lista la añade al
desplegable.

## Pendiente de decidir

1. **PROVEEDOR**: los valores TexLink ES / PT venían alternados en la hoja
   original. Falta saber qué criterio los asigna.
2. **RESPONSABLE**: columna vacía. El nombre del anuncio (columna F) sugiere
   quién originó el lead, pero no se ha dado por supuesto que sea el dueño.
3. **ÚLTIMO CONTACTO de Marta**: está en "En contacto" pero no consta la fecha.
4. **CIUDAD**: 5 de 8 leads solo dicen "España". El formulario de Meta no
   preguntaba la ciudad.

## Avisos

- Las fórmulas por fila y los desplegables llegan hasta la fila 100. Para más
  de 94 leads hay que arrastrarlos hacia abajo.
- Los rangos del panel de control son abiertos y no tienen ese límite.
