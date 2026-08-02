import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { CRMCustomersService } from './crm-customers.service';
import {
  CRMTransaction,
  CreateCRMTransactionDto,
  CRMTransactionListParams,
  CRMTransactionStatus,
  CRMActivityType,
} from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CRMTransactionsService {
  private readonly col = 'crm_transactions';
  private readonly activitiesCol = 'crm_activities';

  constructor(
    private firebase: FirebaseAdminService,
    private customersService: CRMCustomersService,
  ) {}

  async create(dto: CreateCRMTransactionDto): Promise<CRMTransaction> {
    const id = uuidv4();
    const now = new Date();
    const transaction: CRMTransaction = {
      id,
      customerId: dto.customerId,
      customerName: dto.customerName,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      paymentMethod: dto.paymentMethod ?? null,
      description: dto.description ?? null,
      date: dto.date ? new Date(dto.date) : now,
      status: dto.status ?? CRMTransactionStatus.COMPLETED,
      createdAt: now,
    };

    await this.firebase.firestore.collection(this.col).doc(id).set(transaction);

    // Update customer's total revenue if completed
    if (transaction.status === CRMTransactionStatus.COMPLETED) {
      await this.customersService.incrementRevenue(dto.customerId, dto.amount);
    }

    // Log activity
    const activity = {
      id: uuidv4(),
      customerId: dto.customerId,
      type: CRMActivityType.TRANSACTION,
      title: `Transaction of ${dto.amount} ${transaction.currency}`,
      description: dto.description ?? null,
      metadata: { transactionId: id, amount: dto.amount, status: transaction.status },
      authorId: 'system',
      authorName: 'System',
      createdAt: now,
    };

    await this.firebase.firestore
      .collection(this.activitiesCol)
      .doc(activity.id)
      .set(activity);

    return transaction;
  }

  async findById(id: string): Promise<CRMTransaction> {
    const doc = await this.firebase.firestore.collection(this.col).doc(id).get();
    if (!doc.exists) throw new NotFoundException('Transaction not found');
    return doc.data() as CRMTransaction;
  }

  async list(params: CRMTransactionListParams): Promise<{
    items: CRMTransaction[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);

    let query: FirebaseFirestore.Query = this.firebase.firestore
      .collection(this.col)
      .orderBy('date', 'desc');

    if (params.customerId) query = query.where('customerId', '==', params.customerId);
    if (params.status) query = query.where('status', '==', params.status);
    if (params.startDate) query = query.where('date', '>=', new Date(params.startDate));
    if (params.endDate) query = query.where('date', '<=', new Date(params.endDate));

    const snapshot = await query.get();
    const items: CRMTransaction[] = snapshot.docs.map((d: any) => d.data() as CRMTransaction);

    const total = items.length;
    const pages = Math.ceil(total / limit);
    const paginated = items.slice((page - 1) * limit, page * limit);

    return { items: paginated, total, page, limit, pages };
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.firebase.firestore.collection(this.col).doc(id).delete();
  }

  async getTotalRevenue(startDate?: Date, endDate?: Date): Promise<number> {
    let query: FirebaseFirestore.Query = this.firebase.firestore
      .collection(this.col)
      .where('status', '==', CRMTransactionStatus.COMPLETED);

    if (startDate) query = query.where('date', '>=', startDate);
    if (endDate) query = query.where('date', '<=', endDate);

    const snapshot = await query.get();
    return snapshot.docs
      .map((d) => d.data() as CRMTransaction)
      .reduce((sum, t) => sum + t.amount, 0);
  }

  async getMonthlyRevenue(): Promise<{ month: string; revenue: number; transactions: number }[]> {
    const snapshot = await this.firebase.firestore
      .collection(this.col)
      .where('status', '==', CRMTransactionStatus.COMPLETED)
      .orderBy('date', 'asc')
      .get();

    const transactions = snapshot.docs.map((d: any) => d.data() as CRMTransaction);
    const byMonth = new Map<string, { revenue: number; transactions: number }>();

    for (const t of transactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!byMonth.has(key)) {
        byMonth.set(key, { revenue: 0, transactions: 0 });
      }
      const entry = byMonth.get(key)!;
      entry.revenue += t.amount;
      entry.transactions += 1;
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12) // last 12 months
      .map(([, v]) => ({
        month: new Date(
          parseInt(v.toString().split('-')[0] ?? '2024'),
          0,
        ).toLocaleString('en-US', { month: 'short' }),
        ...v,
      }))
      .map((_, i, arr) => arr[i]!);
  }

  async getAllForExport(startDate?: string, endDate?: string): Promise<CRMTransaction[]> {
    let query: FirebaseFirestore.Query = this.firebase.firestore
      .collection(this.col)
      .orderBy('date', 'desc');

    if (startDate) query = query.where('date', '>=', new Date(startDate));
    if (endDate) query = query.where('date', '<=', new Date(endDate));

    const snapshot = await query.get();
    return snapshot.docs.map((d: any) => d.data() as CRMTransaction);
  }
}
