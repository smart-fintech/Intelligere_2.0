import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import { textColourOn } from '@/Modules/SalesInvoice/History/soProcess'

/**
 * A SALES ORDER'S PROCESS CHART AS A VECTOR PDF - one landscape A4 page, as
 * the chart on screen (SalesOrderProcessModal): the order and "Total
 * complete", each process's own bar (done of total, share done), the one
 * 100% bar of every process's contribution with the rest in grey, and the
 * legend.
 *
 *   <ProcessChartPdfDocument chart={processChart(...)} />  - rendered to bytes
 *   by createProcessChartPdf (processChartPdf.js)
 */

const BLUE = '#13669a'
const GREY = '#e0e0e0'
const tidy = (value) => String(Number(Number(value).toFixed(2)))

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: 'Helvetica', color: '#222' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: BLUE },
  overall: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  process: { backgroundColor: '#fbfbfb', borderRadius: 4, padding: 7, marginBottom: 7 },
  processHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  name: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  muted: { color: '#666' },
  track: { height: 8, backgroundColor: '#eeeeee', borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  stackLabel: { marginTop: 10, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  stack: { flexDirection: 'row', height: 26, borderRadius: 3, overflow: 'hidden', borderWidth: 0.6, borderColor: '#d0d0d0' },
  segment: { height: 26, justifyContent: 'center', alignItems: 'center' },
  segmentText: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, color: '#666', fontSize: 7 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2, marginRight: 4 },
})

export default function ProcessChartPdfDocument({ chart }) {
  const segments = [
    ...chart.processes.filter((process) => process.contribution > 0).map((process) => ({ key: process.key, colour: process.colour, value: process.contribution })),
    ...(chart.remainder > 0.000001 ? [{ key: '__remainder', colour: GREY, value: chart.remainder }] : []),
  ]
  return (
    <Document title={`${chart.title || 'Process Report'} - process chart`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>{chart.title || 'Process Report'}</Text>
          <Text style={s.overall}>Total complete: {tidy(chart.overall)}%</Text>
        </View>

        {chart.processes.map((process) => (
          <View key={process.key} style={s.process} wrap={false}>
            <View style={s.processHead}>
              <Text style={s.name}>{process.name}</Text>
              <Text style={s.muted}>
                {process.total !== null && process.done !== null ? `${tidy(process.done)}/${tidy(process.total)} - ` : ''}
                {Math.round(process.donePct)}% done - Weightage {tidy(process.weight)}%
              </Text>
            </View>
            <View style={s.track}>
              <View style={[s.fill, { width: `${process.donePct}%`, backgroundColor: process.colour }]} />
            </View>
          </View>
        ))}

        <Text style={s.stackLabel}>All processes (100%)</Text>
        <View style={s.stack}>
          {segments.map((segment) => (
            <View key={segment.key} style={[s.segment, { width: `${segment.value}%`, backgroundColor: segment.colour }]}>
              {segment.value >= 4 ? <Text style={[s.segmentText, { color: segment.key === '__remainder' ? '#222' : textColourOn(segment.colour) }]}>{Math.round(segment.value)}%</Text> : null}
            </View>
          ))}
        </View>
        <View style={s.axis}>
          {[0, 25, 50, 75, 100].map((tick) => (
            <Text key={tick}>{tick}%</Text>
          ))}
        </View>

        <View style={s.legend}>
          {chart.processes.map((process) => (
            <View key={process.key} style={s.legendItem}>
              <View style={[s.swatch, { backgroundColor: process.colour }]} />
              <Text>{process.name}</Text>
            </View>
          ))}
          {chart.remainder > 0.000001 ? (
            <View style={s.legendItem}>
              <View style={[s.swatch, { backgroundColor: GREY }]} />
              <Text>Remainder</Text>
            </View>
          ) : null}
        </View>
      </Page>
    </Document>
  )
}
