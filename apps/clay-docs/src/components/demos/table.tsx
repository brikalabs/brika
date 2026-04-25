import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@brika/clay/components/table';

const rows = [
  { name: 'Jane Cooper', email: 'jane@example.com', role: 'Admin' },
  { name: 'Cody Fisher', email: 'cody@example.com', role: 'Member' },
  { name: 'Esther Howard', email: 'esther@example.com', role: 'Member' },
];

export function TableDefaultDemo() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.email}>
            <TableCell>{row.name}</TableCell>
            <TableCell className="text-clay-subtle">{row.email}</TableCell>
            <TableCell>{row.role}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
