import { Badge, Button, Input } from '@brika/clay';
import { ArrowRight, Download, FileText, Globe, Plus, Search } from 'lucide-react';
import { type ReactNode, type SyntheticEvent, useState } from 'react';
import { useLocale } from '@/lib/use-locale';
import { type RegistryDescriptor, useAddRegistry, useRegistries } from './hooks';

// ─── Catalogue ────────────────────────────────────────────────────────────────

/**
 * One field inside a registry card: a small icon + uppercase label, with the value stacked below.
 * Stacking keeps long URLs and long localized labels from colliding.
 */
function RegistryField({
  icon: Icon,
  label,
  value,
}: Readonly<{ icon: typeof Search; label: string; value: string }>) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground/70">
        <Icon className="size-3" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="break-all pl-[18px] font-mono text-[12px] text-foreground/90">{value}</p>
    </div>
  );
}

function RegistryCard({ registry }: Readonly<{ registry: RegistryDescriptor }>) {
  const { t } = useLocale();
  const search =
    registry.search?.type === 'v1'
      ? (registry.search.url ?? t('settings:registry.search.v1'))
      : t('settings:registry.search.npm');

  return (
    <div className="space-y-4 rounded-xl border border-border/40 bg-foreground/[0.015] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[15px] text-foreground tracking-tight">
          {registry.name}
        </span>
        <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {registry.id}
        </code>
        {registry.default && (
          <Badge variant="secondary">{t('settings:registry.badges.default')}</Badge>
        )}
      </div>
      <div className="grid gap-3.5">
        <RegistryField icon={Search} label={t('settings:registry.fields.search')} value={search} />
        {registry.install?.registry && (
          <RegistryField
            icon={Download}
            label={t('settings:registry.fields.install')}
            value={registry.install.registry}
          />
        )}
        {registry.pluginUrl && (
          <RegistryField
            icon={Globe}
            label={t('settings:registry.fields.page')}
            value={registry.pluginUrl}
          />
        )}
        <RegistryField
          icon={FileText}
          label={t('settings:registry.fields.readme')}
          value={registry.readme?.type ?? 'v1'}
        />
      </div>
    </div>
  );
}

export function RegistryCatalogue() {
  const { t } = useLocale();
  const { data, isLoading } = useRegistries();

  if (isLoading || !data) {
    return <p className="text-muted-foreground text-sm">{t('common:loading')}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.registries.map((registry) => (
        <RegistryCard key={registry.id} registry={registry} />
      ))}
    </div>
  );
}

// ─── Install routing + search stores ────────────────────────────────────────

/** A bordered row of monospace content, used for both scope mappings and store URLs. */
function Row({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-foreground/[0.01] px-3 py-2 font-mono text-[12px]">
      {children}
    </li>
  );
}

function Subheading({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.16em]">
      {children}
    </p>
  );
}

export function RegistryRouting() {
  const { t } = useLocale();
  const { data } = useRegistries();
  const scopes = Object.entries(data?.npmRegistries ?? {});

  return (
    <div className="space-y-6">
      <div className="space-y-2.5">
        <Subheading>{t('settings:registry.install.title')}</Subheading>
        {scopes.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            {t('settings:registry.empty.install')}
          </p>
        ) : (
          <ul className="space-y-2">
            {scopes.map(([scope, url]) => (
              <Row key={scope}>
                <span className="text-primary">{scope}</span>
                <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
                <span className="break-all text-foreground/90">{url}</span>
              </Row>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2.5">
        <Subheading>{t('settings:registry.stores.title')}</Subheading>
        {(data?.searchStores.length ?? 0) === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            {t('settings:registry.empty.stores')}
          </p>
        ) : (
          <ul className="space-y-2">
            {data?.searchStores.map((store) => (
              <Row key={store}>
                <Globe className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="break-all text-foreground/90">{store}</span>
              </Row>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Add a registry ──────────────────────────────────────────────────────────

/** A labelled input column in the add form. */
function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <label className="space-y-1.5">
      <span className="block font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.14em]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function AddRegistryForm() {
  const { t } = useLocale();
  const add = useAddRegistry();
  const [scope, setScope] = useState('');
  const [registry, setRegistry] = useState('');
  const [store, setStore] = useState('');

  const submit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedScope = scope.trim();
    const trimmedRegistry = registry.trim();
    if (!trimmedScope || !trimmedRegistry) {
      return;
    }
    add.mutate(
      {
        scope: trimmedScope,
        registry: trimmedRegistry,
        store: store.trim() || undefined,
      },
      {
        onSuccess: () => {
          setScope('');
          setRegistry('');
          setStore('');
        },
      }
    );
  };

  const errorMessage = add.error instanceof Error ? add.error.message : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('settings:registry.add.scopeLabel')}>
          <Input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder={t('settings:registry.add.scopePlaceholder')}
            className="font-mono text-[12.5px]"
            autoComplete="off"
          />
        </Field>
        <Field label={t('settings:registry.add.registryLabel')}>
          <Input
            type="url"
            value={registry}
            onChange={(e) => setRegistry(e.target.value)}
            placeholder={t('settings:registry.add.registryPlaceholder')}
            className="font-mono text-[12.5px]"
            autoComplete="off"
          />
        </Field>
        <Field label={t('settings:registry.add.storeLabel')}>
          <Input
            type="url"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            placeholder={t('settings:registry.add.storePlaceholder')}
            className="font-mono text-[12.5px]"
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={add.isPending || !scope.trim() || !registry.trim()}
        >
          <Plus />
          {t('settings:registry.add.submit')}
        </Button>
        {errorMessage && <span className="text-[12.5px] text-destructive">{errorMessage}</span>}
      </div>
    </form>
  );
}
