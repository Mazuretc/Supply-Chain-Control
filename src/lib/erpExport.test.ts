import { describe, expect, it } from 'vitest';
import { mapErpExport } from './erpExport';
import { loadLocalPublicData } from './localData';

const headers = [
  [],
  ['Отбор:'],
  [],
  ['Заказ клиента', null, null, null, null, null, 'Количество заказ клиента'],
  [
    'Поставщик',
    null,
    null,
    'Номенклатура',
    ' Код',
    '№ заказа поставщику',
    null,
    null,
    'Дата окончания производства (Расчетная)',
    'Способ доставки',
    'Статус товара',
    'Дата загрузки данных',
    'Фактическая дата готовности',
    'Дедлайн',
    'Плановая дата поступления в МСК',
    'Клиент',
    'Дата отгрузки',
    'Сток-лист / Поставка',
    'Документ движения',
    'Количество в пути',
    'В производстве',
    'Количество на складе',
    'Подвид сделки',
    'Срыв срока готовности',
  ],
];

describe('ERP export mapping', () => {
  it('turns supplier-order rows into grouped ERP items with ISO dates', () => {
    const data = mapErpExport([
      ...headers,
      ['Заказ клиента PS000000018 от 29.06.2023 18:24:18', null, null, null, null, null, '854'],
      [
        'Ben',
        null,
        null,
        'Модуль EK-WL8-O',
        ' Ex000046838',
        'S-AE23060906TA-005728',
        '854',
        '854',
        '25.07.2023',
        'FOB (Ben)',
        'ARRIVED',
        null,
        null,
        '23.08.2023',
        '23.08.2023',
        'АРГУС-СПЕКТР',
        null,
        '"',
        null,
        null,
        '854',
        '854',
        'Продажа под заказ (сборки)',
        'Нет данных',
      ],
    ], { today: '2026-08-17' });

    expect(data.supplierOrders).toEqual([
      expect.objectContaining({
        id: 'S-AE23060906TA-005728',
        supplierOrderNumber: 'S-AE23060906TA-005728',
        supplier: 'Ben',
        createdAt: '2023-06-29',
        deadline: '2023-08-23',
      }),
    ]);
    expect(data.erpItems).toHaveLength(1);
    expect(data.erpItems[0]).toMatchObject({
      erpCode: 'Ex000046838',
      supplierOrderId: 'S-AE23060906TA-005728',
      nomenclature: 'Модуль EK-WL8-O',
      client: 'АРГУС-СПЕКТР',
      status: 'доставлено',
      production: { productionEndPlan: '2023-07-25' },
      logistics: { deliveryDate: '2023-08-23' },
      deadlines: { deadline: '2023-08-23' },
    });
    expect(data.supplierOrders[0]).toMatchObject({ client: 'АРГУС-СПЕКТР' });
    expect(data.erpItems[0]?.sources.deadline?.type).toBe('erp');
  });

  it('marks in-transit quantity as delivery and delayed production as overdue', () => {
    const data = mapErpExport([
      ...headers,
      [
        'QISU',
        null,
        null,
        'Плата',
        'Ex000096208',
        'SC24111503TD-118436',
        '300',
        '300',
        '01.08.2026',
        'EXD-Avia (EX)',
        'PRODUCING',
        null,
        null,
        '10.08.2026',
        '10.08.2026',
        'КРОН',
        null,
        null,
        null,
        null,
        '300',
        null,
        'Продажа под заказ (печатные платы)',
        '6',
      ],
      [
        'Ben',
        null,
        null,
        'Диод',
        'Ex000088873',
        'CE24070103TA-005728',
        '500',
        '500',
        '17.07.2024',
        'EXD-Avia',
        'finished',
        null,
        '13.03.2024',
        '21.08.2024',
        '21.08.2024',
        'АРГУС-СПЕКТР',
        '01.09.2024',
        null,
        null,
        '500',
        null,
        null,
        'Продажа под заказ (компоненты)',
        '6',
      ],
    ], { today: '2026-08-17' });

    const producing = data.erpItems.find((item) => item.erpCode === 'Ex000096208');
    const shipped = data.erpItems.find((item) => item.erpCode === 'Ex000088873');

    expect(producing?.status).toBe('производство_просрочено');
    expect(producing?.deadlines.deviation).toBe(6);
    expect(producing?.trustLevel).toBe('needs_review');
    expect(shipped?.status).toBe('в_доставке');
    expect(shipped?.production.readyForShipment).toBe(true);
    expect(shipped?.logistics.shipmentDate).toBe('2024-09-01');
    expect(producing?.sources['production.productionEndPlan']?.details).toBe(
      'Дата окончания производства (Расчетная)',
    );
    expect(shipped?.sources['logistics.shipmentDate']?.details).toBe(
      'Фактическая дата отгрузки',
    );
  });

  it('keeps rows without a supplier order unlinked and flags missing status as needing data', () => {
    const data = mapErpExport([
      ...headers,
      [
        'Ben',
        null,
        null,
        'Модуль ARC-WL8-CP',
        'Ex000093291',
        null,
        '50',
        '50',
        '28.09.2024',
        'FOB (Ben)',
        null,
        null,
        null,
        '27.09.2024',
        '27.09.2024',
        'АРГУС-СПЕКТР',
        null,
        null,
        null,
        null,
        '50',
        null,
        'Продажа под заказ (сборки)',
        'Нет данных',
      ],
    ], { today: '2026-08-17' });

    expect(data.supplierOrders).toEqual([]);
    expect(data.erpItems[0]).toMatchObject({
      supplierOrderId: null,
      status: 'требует_данных',
      missingFields: expect.arrayContaining(['Статус товара']),
    });
  });

  it('maps client from a flattened super-vip header row', () => {
    const data = mapErpExport([
      [
        'Заказ клиента',
        'Номенклатура',
        ' Код',
        '№ заказа поставщику',
        'Количество заказ клиента',
        'Количество заказ поставщику',
        'Дата окончания производства (Расчетная)',
        'Способ доставки',
        'Статус товара',
        'Дата загрузки данных',
        'Фактическая дата готовности',
        'Дедлайн',
        'Плановая дата поступления в МСК',
        'Клиент',
        'Дата отгрузки',
        'Сток-лист / Поставка',
        'Документ движения',
        'Количество в пути',
        'В производстве',
        'Количество на складе',
        'Подвид сделки',
        'Срыв срока готовности',
      ],
      [
        'CHY',
        'Печатная плата PS_KAN-D480_v2_1',
        ' PR-00045569',
        'PE26041602EB-002997-2',
        '5,480',
        '5,480',
        '07.07.2026',
        'EXD-Avia (PCB)',
        'Material purchase',
        '14.08.2026',
        '30.09.2026',
        '17.07.2026',
        '16.10.2026',
        'ООО «Энергет»',
        null,
        '"',
        null,
        null,
        '5,480',
        null,
        'Продажа под заказ (печатные платы)',
        '85',
      ],
    ], { today: '2026-08-17' });

    expect(data.erpItems[0]).toMatchObject({
      erpCode: 'PR-00045569',
      supplierOrderId: 'PE26041602EB-002997-2',
      client: 'ООО «Энергет»',
      production: { productionEndPlan: '2026-07-07' },
      deadlines: { deadline: '2026-07-17' },
    });
    expect(data.supplierOrders[0]).toMatchObject({
      supplier: 'CHY',
      client: 'ООО «Энергет»',
    });
  });

  it('loads the super-vip workbook into the local catalogue', async () => {
    const data = await loadLocalPublicData();
    expect(data.erpItems).toHaveLength(366);
    expect(data.supplierOrders).toHaveLength(177);
    expect(data.integrations[0]?.status).toBe('connected');
    expect(data.erpItems.filter((item) => item.erpCode === 'PR-00045569')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          supplierOrderId: 'PE26012301EB-001905-2',
          client: 'КВ Системы ООО',
          production: expect.objectContaining({ productionEndPlan: '2026-05-21' }),
          deadlines: expect.objectContaining({ deadline: '2026-06-25' }),
        }),
        expect.objectContaining({
          supplierOrderId: 'PE26041602EB-002997-2',
          client: 'ООО «Энергет»',
          production: expect.objectContaining({ productionEndPlan: '2026-07-07' }),
          deadlines: expect.objectContaining({ deadline: '2026-07-17' }),
        }),
      ]),
    );
  });
});
