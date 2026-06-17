// apps/web/src/components/MedidaInput.tsx
// Campo de medida (metros) com máscara automática de vírgula: o usuário digita só
// os números e o valor é formatado como metros com 2 casas. Ex.: "150" → 1,50;
// "80" → 0,80; "1500" → 15,00. Internamente o valor é uma string com PONTO
// decimal (ex.: "1.50"), pronta para Number().

interface Props {
  value: string; // metros com ponto decimal, ex.: "1.50" ou "" (vazio)
  onChange: (valor: string) => void;
  className?: string;
  id?: string;
  placeholder?: string;
}

export function MedidaInput({ value, onChange, className = 'input', id, placeholder = '0,00' }: Props) {
  // Exibe com vírgula (pt-BR); vazio enquanto não houver dígitos.
  const display = value === '' ? '' : Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const digitos = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''); // só dígitos, sem zeros à esquerda
    if (!digitos) { onChange(''); return; }
    onChange((parseInt(digitos, 10) / 100).toFixed(2)); // centavos → metros, com ponto
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      className={className}
      value={display}
      onChange={handle}
      placeholder={placeholder}
    />
  );
}
